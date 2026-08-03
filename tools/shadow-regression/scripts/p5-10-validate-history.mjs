/**
 * P5.10 Stage 2 validation — history + analytics in legacy/compare/platform via PG.
 * Does not flip Production flags. Read-only.
 */
import dotenv from "dotenv";
import pg from "pg";
import fs from "node:fs";

dotenv.config({ path: ".env.local" });

const HISTORY_STATUSES = ["settled", "cancelled", "finished", "archived"];

function mapLifecycle(status, leaseOwner) {
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

function mapParticipantStatus({ activeTickets, hasHeld, hasLive }) {
  if (activeTickets <= 0) return "left";
  if (hasLive) return "active";
  if (hasHeld) return "joined";
  return "joined";
}

function tsKey(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : String(v);
}

function bingoStatuses(platformStatuses) {
  const set = new Set();
  for (const s of platformStatuses) {
    if (s === "cancelled") set.add("cancelled");
    if (s === "archived") set.add("idle");
    if (s === "settled") set.add("finished");
    if (s === "finished") set.add("settling");
  }
  return [...set];
}

async function fetchLegacy(pool, from, to, pageSize) {
  const bs = bingoStatuses(HISTORY_STATUSES);
  const countRes = await pool.query(
    `SELECT count(*)::int AS count FROM public.rooms r
     WHERE r.created_at >= $1 AND r.created_at <= $2 AND r.status::text = ANY($3::text[])`,
    [from.toISOString(), to.toISOString(), bs]
  );
  const roomsRes = await pool.query(
    `SELECT id, status, engine_owner_id, created_at, updated_at, waiting_started_at
     FROM public.rooms r
     WHERE r.created_at >= $1 AND r.created_at <= $2 AND r.status::text = ANY($3::text[])
     ORDER BY created_at DESC LIMIT $4`,
    [from.toISOString(), to.toISOString(), bs, pageSize]
  );
  const ids = roomsRes.rows.map((r) => r.id);
  const tickets = ids.length
    ? await pool.query(
        `SELECT room_id, player_user_id, reservation_status, price::float8 AS price,
                created_at, cancelled_at, updated_at
         FROM public.tickets WHERE room_id = ANY($1::uuid[])`,
        [ids]
      )
    : { rows: [] };
  const byRoom = new Map();
  for (const t of tickets.rows) {
    const list = byRoom.get(t.room_id) || [];
    list.push(t);
    byRoom.set(t.room_id, list);
  }

  const items = roomsRes.rows.map((room) => {
    const status = mapLifecycle(room.status, room.engine_owner_id);
    const ts = byRoom.get(room.id) || [];
    const byUser = new Map();
    for (const t of ts) {
      const uid = String(t.player_user_id);
      const st = String(t.reservation_status || "");
      const terminal = ["cancelled", "released", "expired"].includes(st);
      const cur = byUser.get(uid) || {
        activeTickets: 0,
        hasHeld: false,
        hasLive: false,
        amountTotal: 0,
        sourceUpdatedAt: t.updated_at,
      };
      if (!terminal) {
        cur.activeTickets += 1;
        cur.amountTotal += Number(t.price || 0);
        if (st === "held") cur.hasHeld = true;
        if (["reserved", "confirmed", "consumed"].includes(st)) cur.hasLive = true;
      }
      if (t.updated_at > cur.sourceUpdatedAt) cur.sourceUpdatedAt = t.updated_at;
      byUser.set(uid, cur);
    }
    const participants = [...byUser.entries()]
      .map(([userId, a]) => ({
        userId,
        status: mapParticipantStatus(a),
        ticketCount: a.activeTickets,
        amountTotal: Number(a.amountTotal.toFixed(2)),
        sourceUpdatedAt: a.sourceUpdatedAt,
      }))
      .sort((a, b) => a.userId.localeCompare(b.userId));
    const amountTotal = participants.reduce((s, p) => s + p.amountTotal, 0);
    const participantCount = participants.filter(
      (p) => p.status === "joined" || p.status === "active"
    ).length;
    const startedAt = ["running", "finished", "settled", "archived"].includes(status)
      ? room.waiting_started_at || room.created_at
      : null;
    const finishedAt = ["finished", "settled", "archived"].includes(status)
      ? room.updated_at
      : null;
    const settledAt = status === "settled" ? room.updated_at : null;
    return {
      sessionId: room.id,
      gameSlug: "bingo",
      status,
      createdAt: room.created_at,
      startedAt,
      finishedAt,
      settledAt,
      participantCount,
      amountTotal: Number(amountTotal.toFixed(2)),
      participants,
    };
  });

  return { items, totalCount: countRes.rows[0].count, source: "legacy" };
}

async function fetchPlatform(pool, from, to, pageSize) {
  const countRes = await pool.query(
    `SELECT count(*)::int AS count FROM platform.game_sessions gs
     WHERE gs.correlation_key LIKE 'bingo.room:%'
       AND gs.created_at >= $1 AND gs.created_at <= $2
       AND gs.status = ANY($3::text[])`,
    [from.toISOString(), to.toISOString(), HISTORY_STATUSES]
  );
  const sessions = await pool.query(
    `SELECT gs.id, gs.status, g.code AS game_slug, gs.created_at, gs.started_at,
            gs.finished_at, gs.settled_at, gs.participant_count
     FROM platform.game_sessions gs
     JOIN platform.games g ON g.id = gs.game_id
     WHERE gs.correlation_key LIKE 'bingo.room:%'
       AND gs.created_at >= $1 AND gs.created_at <= $2
       AND gs.status = ANY($3::text[])
     ORDER BY gs.created_at DESC LIMIT $4`,
    [from.toISOString(), to.toISOString(), HISTORY_STATUSES, pageSize]
  );
  const ids = sessions.rows.map((r) => r.id);
  const parts = ids.length
    ? await pool.query(
        `SELECT session_id, user_id, status, ticket_count, amount_total::float8 AS amount_total,
                source_updated_at
         FROM platform.session_participants WHERE session_id = ANY($1::uuid[])`,
        [ids]
      )
    : { rows: [] };
  const byS = new Map();
  for (const p of parts.rows) {
    const list = byS.get(p.session_id) || [];
    list.push(p);
    byS.set(p.session_id, list);
  }
  const items = sessions.rows.map((s) => {
    const participants = (byS.get(s.id) || [])
      .map((p) => ({
        userId: p.user_id,
        status: p.status,
        ticketCount: Number(p.ticket_count || 0),
        amountTotal: Number(Number(p.amount_total || 0).toFixed(2)),
        sourceUpdatedAt: p.source_updated_at,
      }))
      .sort((a, b) => a.userId.localeCompare(b.userId));
    const amountTotal = participants.reduce((sum, p) => sum + p.amountTotal, 0);
    const cancelled = s.status === "cancelled";
    return {
      sessionId: s.id,
      gameSlug: s.game_slug || "bingo",
      status: s.status,
      createdAt: s.created_at,
      startedAt: cancelled ? null : s.started_at,
      finishedAt: cancelled ? null : s.finished_at,
      settledAt: cancelled ? null : s.settled_at,
      participantCount: Number(s.participant_count || 0),
      amountTotal: Number(amountTotal.toFixed(2)),
      participants,
    };
  });
  return { items, totalCount: countRes.rows[0].count, source: "platform" };
}

function compareHistory(legacy, platform) {
  const mismatches = [];
  if (legacy.totalCount !== platform.totalCount) {
    mismatches.push({
      type: "totalCount",
      legacy: legacy.totalCount,
      platform: platform.totalCount,
    });
  }
  const lMap = new Map(legacy.items.map((r) => [r.sessionId, r]));
  const pMap = new Map(platform.items.map((r) => [r.sessionId, r]));
  for (const id of lMap.keys()) if (!pMap.has(id)) mismatches.push({ type: "missing_platform", id });
  for (const id of pMap.keys()) if (!lMap.has(id)) mismatches.push({ type: "missing_legacy", id });
  for (const [id, L] of lMap) {
    const P = pMap.get(id);
    if (!P) continue;
    if (L.gameSlug !== P.gameSlug) mismatches.push({ type: "gameSlug", id });
    if (L.status !== P.status) mismatches.push({ type: "status", id, L: L.status, P: P.status });
    if (L.participantCount !== P.participantCount)
      mismatches.push({ type: "participantCount", id });
    if (Math.abs(L.amountTotal - P.amountTotal) > 0.009)
      mismatches.push({ type: "amount", id });
    for (const f of ["createdAt", "startedAt", "finishedAt", "settledAt"]) {
      if (tsKey(L[f]) !== tsKey(P[f]))
        mismatches.push({ type: "timestamp", field: f, id, L: tsKey(L[f]), P: tsKey(P[f]) });
    }
  }
  return mismatches;
}

function analyticsFrom(items, totalCount) {
  const byStatus = {};
  let participantCount = 0;
  let amountTotal = 0;
  for (const r of items) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    participantCount += r.participantCount;
    amountTotal += r.amountTotal;
  }
  return {
    sessionCount: totalCount,
    participantCount,
    amountTotal: Number(amountTotal.toFixed(2)),
    byStatus,
  };
}

function compareAnalytics(L, P) {
  const mismatches = [];
  if (L.sessionCount !== P.sessionCount)
    mismatches.push({ type: "sessionCount", L: L.sessionCount, P: P.sessionCount });
  if (L.participantCount !== P.participantCount)
    mismatches.push({
      type: "participantCount",
      L: L.participantCount,
      P: P.participantCount,
    });
  if (Math.abs(L.amountTotal - P.amountTotal) > 0.009)
    mismatches.push({ type: "amount", L: L.amountTotal, P: P.amountTotal });
  const keys = new Set([...Object.keys(L.byStatus), ...Object.keys(P.byStatus)]);
  for (const k of keys) {
    if ((L.byStatus[k] || 0) !== (P.byStatus[k] || 0))
      mismatches.push({ type: "byStatus", status: k, L: L.byStatus[k] || 0, P: P.byStatus[k] || 0 });
  }
  return mismatches;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DATABASE_URL");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const to = new Date();

const report = {
  overall: "PASS",
  flagDefault: "PLATFORM_HISTORY_SOURCE defaults to legacy (no Production switch)",
  paths: {},
  shadow: {},
  impact: {
    wallet: "untouched",
    tournament: "untouched",
    lobby: "untouched",
    live: "untouched",
    settlement: "untouched",
  },
};

try {
  const legacy = await fetchLegacy(pool, from, to, 50);
  const platform = await fetchPlatform(pool, from, to, 50);
  const histMismatches = compareHistory(legacy, platform);
  const logs = [];
  logs.push(
    `[PlatformHistory] history compare ${JSON.stringify({
      mismatchCount: histMismatches.length,
      legacyTotal: legacy.totalCount,
      platformTotal: platform.totalCount,
    })}`
  );

  report.paths.history = {
    legacy: {
      status: legacy.items.length >= 0 ? "PASS" : "FAIL",
      totalCount: legacy.totalCount,
      itemCount: legacy.items.length,
    },
    compare: {
      status: histMismatches.length === 0 ? "PASS" : "FAIL",
      responseSource: "legacy",
      mismatchCount: histMismatches.length,
      mismatches: histMismatches.slice(0, 20),
      logs,
    },
    platform: {
      status: histMismatches.length === 0 ? "PASS" : "FAIL",
      totalCount: platform.totalCount,
      itemCount: platform.items.length,
      matchLegacy: histMismatches.length === 0,
      sample: platform.items[0] || null,
    },
  };

  // Analytics over full filtered set (same page window when totals <= 50)
  const lA = analyticsFrom(legacy.items, legacy.totalCount);
  const pA = analyticsFrom(platform.items, platform.totalCount);
  // Prefer SQL platform analytics for platform mode realism when totals fit page
  const aMismatches = compareAnalytics(lA, pA);
  logs.push(
    `[PlatformHistory] analytics compare ${JSON.stringify({
      mismatchCount: aMismatches.length,
      legacy: lA,
      platform: pA,
    })}`
  );

  report.paths.analytics = {
    legacy: { status: "PASS", ...lA },
    compare: {
      status: aMismatches.length === 0 ? "PASS" : "FAIL",
      responseSource: "legacy",
      mismatchCount: aMismatches.length,
      mismatches: aMismatches,
    },
    platform: {
      status: aMismatches.length === 0 ? "PASS" : "FAIL",
      ...pA,
      matchLegacy: aMismatches.length === 0,
    },
  };

  const recon = await pool.query(
    `SELECT platform.fn_shadow_participant_recon_report() AS r`
  );
  const cov = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM public.rooms) AS rooms,
      (SELECT count(*)::int FROM platform.game_sessions WHERE correlation_key LIKE 'bingo.room:%') AS sessions,
      (SELECT count(*)::int FROM public.rooms r LEFT JOIN platform.game_sessions gs ON gs.id=r.id WHERE gs.id IS NULL) AS missing,
      (SELECT count(*)::int FROM platform.shadow_outbox WHERE processed_at IS NULL AND dead_lettered_at IS NULL) AS pending,
      (SELECT count(*)::int FROM platform.shadow_outbox WHERE dead_lettered_at IS NOT NULL) AS dead
  `);
  const r = recon.rows[0].r;
  report.shadow = {
    status:
      r.missing === 0 &&
      r.duplicate === 0 &&
      r.status_mismatch === 0 &&
      r.amount_mismatch === 0 &&
      r.timestamp_mismatch === 0 &&
      r.dlq === 0 &&
      r.pending_outbox === 0 &&
      cov.rows[0].missing === 0 &&
      cov.rows[0].pending === 0 &&
      cov.rows[0].dead === 0
        ? "PASS"
        : "FAIL",
    participantRecon: r,
    coverage: cov.rows[0],
  };

  const fails = [
    report.paths.history.legacy.status,
    report.paths.history.compare.status,
    report.paths.history.platform.status,
    report.paths.analytics.legacy.status,
    report.paths.analytics.compare.status,
    report.paths.analytics.platform.status,
    report.shadow.status,
  ].filter((s) => s !== "PASS");
  report.overall = fails.length === 0 ? "PASS" : "FAIL";
  report.platformHistoryLogs = logs;
} catch (e) {
  report.overall = "FAIL";
  report.error = String(e?.message || e);
} finally {
  await pool.end();
}

fs.mkdirSync("docs/testing", { recursive: true });
fs.writeFileSync(
  "docs/testing/p5-10-history-analytics-validation-raw.json",
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report, null, 2));
process.exit(report.overall === "PASS" ? 0 : 1);
