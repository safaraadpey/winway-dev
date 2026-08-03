import { query } from "../db.mjs";
import { config } from "../config.mjs";

/**
 * Map Bingo room_status (+ lease) → Platform lifecycle (mirrors platform.fn_shadow_map_lifecycle).
 * @param {string} status
 * @param {string|null} leaseOwner
 */
export function mapLifecycle(status, leaseOwner) {
  const s = String(status || "");
  if (s === "cancelled") return "cancelled";
  if (s === "idle") return "archived";
  if (s === "finished") return "settled";
  if (s === "settling") return "finished";
  if (s === "playing" || s === "live") return "running";
  if (s === "waiting" && leaseOwner && String(leaseOwner).trim()) return "claimed";
  if (s === "waiting") return "waiting";
  return "created";
}

/**
 * Drain + optional wait until room mirrored.
 * @param {string} roomId
 * @param {{ waitMs?: number }} [opts]
 */
export async function drainUntilMirrored(roomId, opts = {}) {
  const waitMs = opts.waitMs ?? config.drainWaitMs;
  const started = Date.now();
  await query(`SELECT platform.fn_shadow_enqueue($1::uuid)`, [roomId]);
  await query(`SELECT platform.fn_shadow_drain(200)`);

  while (Date.now() - started < waitMs) {
    const { rows } = await query(
      `SELECT gs.id, gs.status,
              (SELECT count(*)::int FROM platform.shadow_outbox o
                WHERE o.room_id = $1 AND o.processed_at IS NULL AND o.dead_lettered_at IS NULL) AS pending
       FROM platform.game_sessions gs
       WHERE gs.id = $1`,
      [roomId]
    );
    if (rows[0] && rows[0].pending === 0) return rows[0];
    await query(`SELECT platform.fn_shadow_drain(100)`);
    await sleep(250);
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Full shadow parity validation for a Bingo room.
 * @param {string} roomId
 * @returns {Promise<import('../framework/types.mjs').ValidationResult>}
 */
export async function validateShadowParity(roomId) {
  /** @type {import('../framework/types.mjs').ValidationIssue[]} */
  const issues = [];
  const meta = { roomId, sessionId: roomId };

  const roomRes = await query(
    `SELECT id, status::text AS status, engine_owner_id, engine_lease_until, engine_lease_epoch,
            updated_at, card_price
     FROM public.rooms WHERE id = $1`,
    [roomId]
  );
  if (!roomRes.rows[0]) {
    issues.push({ severity: "hard", code: "room_missing", message: "Bingo room not found" });
    return { ok: false, issues, meta };
  }
  const room = roomRes.rows[0];
  const expected = mapLifecycle(room.status, room.engine_owner_id);

  const sessRes = await query(
    `SELECT id, status, lease_owner, settled_at, correlation_key
     FROM platform.game_sessions WHERE id = $1`,
    [roomId]
  );
  const sessions = sessRes.rows;

  if (sessions.length === 0) {
    issues.push({ severity: "hard", code: "session_missing", message: "No Platform session for room" });
  } else if (sessions.length > 1) {
    issues.push({
      severity: "hard",
      code: "session_duplicate",
      message: `Expected 1 session, found ${sessions.length}`,
    });
  } else {
    meta.sessionId = sessions[0].id;
    if (sessions[0].id !== roomId) {
      issues.push({
        severity: "hard",
        code: "identity_mismatch",
        message: `session.id ${sessions[0].id} !== room.id ${roomId}`,
      });
    }
    if (sessions[0].status !== expected) {
      issues.push({
        severity: "hard",
        code: "lifecycle_divergence",
        message: `Platform ${sessions[0].status} !== expected ${expected} (bingo=${room.status})`,
      });
    }
  }

  const dupCorr = await query(
    `SELECT count(*)::int AS n FROM platform.game_sessions WHERE correlation_key = $1`,
    [`bingo.room:${roomId}`]
  );
  if (dupCorr.rows[0]?.n > 1) {
    issues.push({
      severity: "hard",
      code: "correlation_duplicate",
      message: "Duplicate correlation_key sessions",
    });
  }

  // Participants: P5.4 does not mirror tickets → session_participants yet (soft).
  const ticketUsers = await query(
    `SELECT count(DISTINCT player_user_id)::int AS n FROM public.tickets WHERE room_id = $1`,
    [roomId]
  );
  const partUsers = await query(
    `SELECT count(DISTINCT user_id)::int AS n FROM platform.session_participants WHERE session_id = $1`,
    [roomId]
  );
  meta.ticketUsers = ticketUsers.rows[0]?.n ?? 0;
  meta.participantUsers = partUsers.rows[0]?.n ?? 0;
  if ((ticketUsers.rows[0]?.n || 0) > 0 && (partUsers.rows[0]?.n || 0) === 0) {
    issues.push({
      severity: "soft",
      code: "participants_not_mirrored",
      message:
        "Tickets exist but session_participants empty (expected until participant shadow lands)",
    });
  } else if (
    (ticketUsers.rows[0]?.n || 0) > 0 &&
    ticketUsers.rows[0].n !== partUsers.rows[0].n
  ) {
    issues.push({
      severity: "soft",
      code: "participants_mismatch",
      message: `ticket users ${ticketUsers.rows[0].n} vs participants ${partUsers.rows[0].n}`,
    });
  }

  if (expected === "settled" || room.status === "finished") {
    const st = await query(
      `SELECT status, applied_at FROM platform.session_settlement
       WHERE session_id = $1 AND settlement_key = $2`,
      [roomId, `bingo.settle:${roomId}`]
    );
    if (!st.rows[0]) {
      issues.push({
        severity: "hard",
        code: "settlement_missing",
        message: "Expected session_settlement for finished/settled room",
      });
    } else if (st.rows[0].status !== "applied") {
      issues.push({
        severity: "hard",
        code: "settlement_not_applied",
        message: `settlement status=${st.rows[0].status}`,
      });
    } else {
      const sess = sessions[0];
      if (sess?.settled_at && st.rows[0].applied_at) {
        const a = new Date(sess.settled_at).getTime();
        const b = new Date(st.rows[0].applied_at).getTime();
        if (a !== b) {
          issues.push({
            severity: "hard",
            code: "settlement_ts_mismatch",
            message: "settled_at !== settlement.applied_at",
          });
        }
      }
      meta.settlementAppliedAt = st.rows[0].applied_at;
    }
  }

  // Commission soft check
  const comm = await query(
    `SELECT count(*)::int AS n,
            min(created_at) AS first_at,
            max(created_at) AS last_at
     FROM public.commissions_log
     WHERE room_id = $1 OR ticket_id IN (SELECT id FROM public.tickets WHERE room_id = $1)`,
    [roomId]
  ).catch(() => ({ rows: [{ n: 0 }] }));
  meta.commissionRows = comm.rows[0]?.n ?? 0;
  if ((comm.rows[0]?.n || 0) > 0) {
    const first = comm.rows[0].first_at;
    const last = comm.rows[0].last_at;
    if (!first || !last) {
      issues.push({
        severity: "soft",
        code: "commission_ts_invalid",
        message: "commission rows missing timestamps",
      });
    } else if (new Date(last) < new Date(first)) {
      issues.push({
        severity: "hard",
        code: "commission_ts_order",
        message: "commission last_at < first_at",
      });
    }
  }

  const outbox = await query(
    `SELECT
       count(*) FILTER (WHERE processed_at IS NULL AND dead_lettered_at IS NULL)::int AS pending,
       count(*) FILTER (WHERE dead_lettered_at IS NOT NULL)::int AS dlq,
       coalesce(max(retry_count) FILTER (WHERE processed_at IS NOT NULL), 0)::int AS max_retry
     FROM platform.shadow_outbox WHERE room_id = $1`,
    [roomId]
  );
  meta.pendingOutbox = outbox.rows[0]?.pending ?? 0;
  meta.dlq = outbox.rows[0]?.dlq ?? 0;
  meta.maxRetry = outbox.rows[0]?.max_retry ?? 0;

  if ((outbox.rows[0]?.pending || 0) > 0) {
    issues.push({
      severity: "hard",
      code: "outbox_not_empty",
      message: `pending outbox=${outbox.rows[0].pending}`,
    });
  }
  if ((outbox.rows[0]?.dlq || 0) > 0) {
    issues.push({
      severity: "hard",
      code: "dlq_not_empty",
      message: `dlq=${outbox.rows[0].dlq}`,
    });
  }
  if ((outbox.rows[0]?.max_retry || 0) > config.maxRetryAcceptable) {
    issues.push({
      severity: "soft",
      code: "retry_high",
      message: `max retry_count=${outbox.rows[0].max_retry} > ${config.maxRetryAcceptable}`,
    });
  }

  const hardFail = issues.some((i) => i.severity === "hard");
  return { ok: !hardFail, issues, meta };
}
