#!/usr/bin/env node
/**
 * P1 incremental reconcile proofs — isolated synthetic fixtures only.
 * Never mutates real production rows outside tagged p1-reconcile-proof-* fixtures.
 *
 * Usage: node tools/shadow-regression/scripts/p1-incremental-reconcile-proofs.mjs [--perf-only] [--drift-only]
 */
import crypto from "node:crypto";
import { query, withClient, closePool } from "../src/db.mjs";
import {
  createHarnessRoom,
  setRoomLifecycle,
  attachPlayers,
  forceDrain,
} from "../src/engines/bingo/driver.mjs";
import { drainUntilMirrored } from "../src/validate/shadowParity.mjs";

const PROOF_PREFIX = "p1-reconcile-proof-";

/** @type {{ name: string, pass: boolean, detail?: string }[]} */
const results = [];

function pass(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, pass: false, detail });
  console.error(`FAIL  ${name}${detail ? `: ${detail}` : ""}`);
}

function assert(condition, name, detail = "") {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

async function tagFixture(roomId, runId) {
  await query(
    `UPDATE platform.game_sessions
     SET correlation_key = $2
     WHERE id = $1`,
    [roomId, `bingo.room:${PROOF_PREFIX}${runId}`]
  );
  await query(
    `UPDATE platform.session_participants
     SET mirror_meta = coalesce(mirror_meta, '{}'::jsonb) || jsonb_build_object('p1_proof_run_id', $2::text)
     WHERE session_id = $1`,
    [roomId, runId]
  );
}

async function assertFixtureRoom(roomId, runId) {
  const { rows } = await query(
    `SELECT gs.correlation_key
     FROM platform.game_sessions gs
     WHERE gs.id = $1`,
    [roomId]
  );
  const key = rows[0]?.correlation_key || "";
  if (!key.includes(`${PROOF_PREFIX}${runId}`)) {
    throw new Error(`Safety: room ${roomId} is not a tagged proof fixture (${key})`);
  }
}

async function teardownFixture(roomId, runId) {
  await assertFixtureRoom(roomId, runId).catch(() => {
    /* room may already be deleted */
  });
  await query(`DELETE FROM platform.shadow_outbox WHERE room_id = $1`, [roomId]);
  await query(`DELETE FROM platform.shadow_mirror_log WHERE room_id = $1`, [roomId]);
  await query(`DELETE FROM platform.session_participants WHERE session_id = $1`, [roomId]);
  await query(`DELETE FROM platform.session_events WHERE session_id = $1`, [roomId]);
  await query(`DELETE FROM platform.session_settlement WHERE session_id = $1`, [roomId]);
  await query(`DELETE FROM platform.session_state WHERE session_id = $1`, [roomId]);
  await query(`DELETE FROM platform.game_sessions WHERE id = $1`, [roomId]);
  await query(`DELETE FROM public.tickets WHERE room_id = $1`, [roomId]);
  await query(`DELETE FROM public.rooms WHERE id = $1`, [roomId]);
}

/**
 * @returns {Promise<{ runId: string, roomId: string, userId: string }>}
 */
async function setupFixture() {
  const runId = crypto.randomUUID();
  const label = `${PROOF_PREFIX}${runId}`;
  const { roomId } = await createHarnessRoom({ label });
  await setRoomLifecycle(roomId, "waiting", { lease: false });
  const attached = await attachPlayers(roomId, 1);
  if (!attached.tickets) {
    throw new Error("setupFixture: could not create synthetic ticket");
  }
  const { rows: users } = await query(
    `SELECT DISTINCT player_user_id AS user_id FROM public.tickets WHERE room_id = $1 LIMIT 1`,
    [roomId]
  );
  const userId = users[0]?.user_id;
  if (!userId) throw new Error("setupFixture: no ticket user");

  await query(`SELECT platform.fn_shadow_enqueue($1::uuid)`, [roomId]);
  await forceDrain(200);
  await drainUntilMirrored(roomId, { waitMs: 8000 });
  await tagFixture(roomId, runId);
  await assertFixtureRoom(roomId, runId);
  return { runId, roomId, userId };
}

async function reconcile(limit = 200) {
  const { rows } = await query(`SELECT platform.fn_shadow_reconcile($1::int) AS r`, [limit]);
  return rows[0]?.r;
}

async function fixtureParticipantOk(roomId, userId) {
  const { rows } = await query(
    `SELECT sp.status, sp.amount_total,
            (SELECT coalesce(sum(t.price),0) FROM public.tickets t
             WHERE t.room_id = sp.session_id AND t.player_user_id = sp.user_id
               AND t.reservation_status::text NOT IN ('cancelled','released','expired')) AS expected_amount
     FROM platform.session_participants sp
     WHERE sp.session_id = $1 AND sp.user_id = $2`,
    [roomId, userId]
  );
  const row = rows[0];
  if (!row) return false;
  return Number(row.amount_total) === Number(row.expected_amount) && ["joined", "active"].includes(row.status);
}

async function runPerfProof() {
  console.log("\n=== Performance proof (read-only incremental runs) ===");
  const durations = [];
  for (let i = 0; i < 100; i++) {
    const r = await reconcile(200);
    durations.push(Number(r.duration_ms) || 0);
  }
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const max = Math.max(...durations);
  console.log(`100-run incremental: avg=${avg.toFixed(1)}ms max=${max.toFixed(1)}ms`);
  assert(avg < 200, "perf avg < 200ms", `${avg.toFixed(1)}ms`);
  assert(max < 2000, "perf max < 2s", `${max.toFixed(1)}ms`);

  const { rows: explainRows } = await query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT t.room_id FROM public.tickets t
     WHERE t.updated_at >= now() - interval '3 minutes'
     LIMIT 200`
  );
  const plan = explainRows.map((r) => r["QUERY PLAN"]).join("\n");
  const usesTicketIdx = /idx_tickets_updated_at|Index Scan.*tickets/i.test(plan);
  assert(usesTicketIdx, "tickets window uses updated_at index", usesTicketIdx ? "found" : plan.slice(0, 120));
}

async function runDriftTest(name, fn) {
  let fixture = null;
  try {
    fixture = await setupFixture();
    await fn(fixture);
    pass(name);
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
  } finally {
    if (fixture) {
      try {
        await teardownFixture(fixture.roomId, fixture.runId);
      } catch (e) {
        fail(`${name} teardown`, e instanceof Error ? e.message : String(e));
      }
    }
  }
}

async function runDriftProofs() {
  console.log("\n=== Drift proofs (fixture-only) ===");

  await runDriftTest("missing participant", async ({ roomId, userId, runId }) => {
    await assertFixtureRoom(roomId, runId);
    await query(
      `DELETE FROM platform.session_participants WHERE session_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    const r = await reconcile(200);
    if ((r.enqueued ?? 0) < 1) throw new Error(`expected enqueue, got ${JSON.stringify(r)}`);
    await forceDrain(200);
    if (!(await fixtureParticipantOk(roomId, userId))) throw new Error("participant not healed");
  });

  await runDriftTest("amount drift (platform-only, no ticket touch)", async ({ roomId, userId, runId }) => {
    await assertFixtureRoom(roomId, runId);
    await query(
      `UPDATE platform.session_participants SET amount_total = amount_total + 1
       WHERE session_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    const r = await reconcile(200);
    if ((r.enqueued ?? 0) < 1) throw new Error(`expected enqueue, got ${JSON.stringify(r)}`);
    await forceDrain(200);
    if (!(await fixtureParticipantOk(roomId, userId))) throw new Error("amount not healed");
  });

  await runDriftTest("timestamp drift", async ({ roomId, userId, runId }) => {
    await assertFixtureRoom(roomId, runId);
    await query(
      `UPDATE platform.session_participants
       SET source_updated_at = source_updated_at - interval '1 hour'
       WHERE session_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    const r = await reconcile(200);
    if ((r.enqueued ?? 0) < 1) throw new Error(`expected enqueue, got ${JSON.stringify(r)}`);
    await forceDrain(200);
    const { rows } = await query(
      `SELECT sp.source_updated_at, max(t.updated_at) AS ticket_max
       FROM platform.session_participants sp
       JOIN public.tickets t ON t.room_id = sp.session_id AND t.player_user_id = sp.user_id
       WHERE sp.session_id = $1 AND sp.user_id = $2
       GROUP BY sp.source_updated_at`,
      [roomId, userId]
    );
    if (!rows[0] || rows[0].source_updated_at?.toISOString() !== rows[0].ticket_max?.toISOString()) {
      throw new Error("timestamp not healed");
    }
  });

  await runDriftTest("status drift", async ({ roomId, userId, runId }) => {
    await assertFixtureRoom(roomId, runId);
    await query(
      `UPDATE platform.session_participants SET status = 'left'
       WHERE session_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    const r = await reconcile(200);
    if ((r.enqueued ?? 0) < 1) throw new Error(`expected enqueue, got ${JSON.stringify(r)}`);
    await forceDrain(200);
    if (!(await fixtureParticipantOk(roomId, userId))) throw new Error("status not healed");
  });

  await runDriftTest("lifecycle drift", async ({ roomId, runId }) => {
    await assertFixtureRoom(roomId, runId);
    // Claimed lifecycle (waiting + lease) — avoid playing path (room_seed / game manifest).
    await setRoomLifecycle(roomId, "waiting", { lease: true });
    await forceDrain(200);
    await query(
      `UPDATE platform.game_sessions SET status = 'waiting', updated_at = now() WHERE id = $1`,
      [roomId]
    );
    const r = await reconcile(200);
    if ((r.enqueued ?? 0) < 1) throw new Error(`expected enqueue, got ${JSON.stringify(r)}`);
    await forceDrain(200);
    const { rows } = await query(
      `SELECT rm.status::text AS room_status, gs.status AS session_status, rm.engine_owner_id
       FROM public.rooms rm JOIN platform.game_sessions gs ON gs.id = rm.id
       WHERE rm.id = $1`,
      [roomId]
    );
    const mapped =
      rows[0]?.room_status === "waiting" &&
      rows[0]?.engine_owner_id &&
      rows[0]?.session_status === "claimed";
    if (!mapped) throw new Error(`lifecycle not healed: ${JSON.stringify(rows[0])}`);
  });

  await runDriftTest("idempotency", async ({ roomId, userId, runId }) => {
    await assertFixtureRoom(roomId, runId);
    await query(
      `UPDATE platform.session_participants SET amount_total = amount_total + 1
       WHERE session_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    await reconcile(200);
    await forceDrain(200);
    if (!(await fixtureParticipantOk(roomId, userId))) throw new Error("fixture not healed before idempotency check");
    for (let i = 0; i < 10; i++) {
      const { rows: before } = await query(
        `SELECT count(*)::int AS n FROM platform.shadow_outbox
         WHERE room_id = $1 AND processed_at IS NULL AND dead_lettered_at IS NULL`,
        [roomId]
      );
      await reconcile(200);
      const { rows: after } = await query(
        `SELECT count(*)::int AS n FROM platform.shadow_outbox
         WHERE room_id = $1 AND processed_at IS NULL AND dead_lettered_at IS NULL`,
        [roomId]
      );
      if ((after[0]?.n ?? 0) > (before[0]?.n ?? 0)) {
        throw new Error(`fixture outbox grew on run ${i + 1}: ${before[0]?.n} -> ${after[0]?.n}`);
      }
    }
  });

  await runDriftTest("advisory lock overlap", async () => {
    const lockKey = "platform.shadow_reconcile";
    await withClient(async (holder) => {
      await holder.query(`SELECT pg_advisory_lock(hashtext($1))`, [lockKey]);
      try {
        const { rows } = await query(`SELECT platform.fn_shadow_reconcile(200) AS r`);
        const r = rows[0]?.r;
        if (r?.skipped_overlap !== true) {
          throw new Error(`expected skipped_overlap while lock held, got ${JSON.stringify(r)}`);
        }
      } finally {
        await holder.query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]);
      }
    });
  });
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const perfOnly = args.has("--perf-only");
  const driftOnly = args.has("--drift-only");

  try {
    if (!driftOnly) await runPerfProof();
    if (!perfOnly) await runDriftProofs();

    const failed = results.filter((r) => !r.pass);
    console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} passed ===`);
    if (failed.length) {
      failed.forEach((f) => console.error(`  FAIL ${f.name}: ${f.detail}`));
      process.exitCode = 1;
    }
  } finally {
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
