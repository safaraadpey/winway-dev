import {
  attachPlayers,
  cancelHarnessRoom,
  createHarnessRoom,
  delayPendingOutbox,
  driveFullLifecycle,
  forceDrain,
  forceEnqueue,
  getAnyPoolId,
  getPoolCardCount,
  findTournamentRoom,
  seedWinners,
  setRoomLifecycle,
} from "./driver.mjs";
import { drainUntilMirrored, validateShadowParity } from "../../validate/shadowParity.mjs";
import { query } from "../../db.mjs";

/**
 * @param {string} id
 * @param {string} title
 * @param {(ctx: import('../../framework/types.mjs').ScenarioContext) => Promise<object>} fn
 * @returns {import('../../framework/types.mjs').Scenario}
 */
function scenario(id, title, fn) {
  return {
    id,
    title,
    engine: "bingo",
    async run(ctx) {
      const started = Date.now();
      try {
        const out = await fn(ctx);
        const roomId = out.roomId ?? null;
        if (roomId) ctx.createdRoomIds.push(roomId);
        let validation = out.validation;
        if (!validation && roomId) {
          await drainUntilMirrored(roomId);
          validation = await validateShadowParity(roomId);
        }
        const hard = (validation?.issues || []).filter((i) => i.severity === "hard");
        const status = out.skipped
          ? "SKIP"
          : validation && !validation.ok
            ? "FAIL"
            : "PASS";
        return {
          id,
          title,
          engine: "bingo",
          status,
          roomId,
          sessionId: validation?.meta?.sessionId ?? roomId,
          durationMs: Date.now() - started,
          mismatch: hard.map((h) => h.message).join("; ") || null,
          issues: validation?.issues || [],
          skipReason: out.skipReason,
          detail: out.detail,
          validation,
        };
      } catch (err) {
        return {
          id,
          title,
          engine: "bingo",
          status: "FAIL",
          roomId: null,
          sessionId: null,
          durationMs: Date.now() - started,
          mismatch: err instanceof Error ? err.message : String(err),
          issues: [
            {
              severity: "hard",
              code: "scenario_exception",
              message: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    },
  };
}

async function lobbyScenario(ctx, players, titleId) {
  const poolId = await getAnyPoolId();
  const { roomId } = await createHarnessRoom({ label: titleId, poolId });
  await drainUntilMirrored(roomId);
  await attachPlayers(roomId, players);
  await driveFullLifecycle(roomId, { earlyFinish: false });
  const validation = await validateShadowParity(roomId);
  return { roomId, validation, detail: { players } };
}

/** @type {import('../../framework/types.mjs').Scenario[]} */
export const bingoScenarios = [
  scenario("bingo-lobby-2", "Normal lobby (2 players)", async (ctx) =>
    lobbyScenario(ctx, 2, "lobby-2")
  ),

  scenario("bingo-lobby-4", "Normal lobby (4 players)", async (ctx) =>
    lobbyScenario(ctx, 4, "lobby-4")
  ),

  scenario("bingo-early-winner", "Early winner", async () => {
    const { roomId } = await createHarnessRoom({ label: "early-winner" });
    await drainUntilMirrored(roomId);
    await attachPlayers(roomId, 2);
    await driveFullLifecycle(roomId, { earlyFinish: true });
    await seedWinners(roomId, { winType: "full", count: 1 });
    return { roomId, validation: await validateShadowParity(roomId) };
  }),

  scenario("bingo-late-winner", "Late winner", async () => {
    const { roomId } = await createHarnessRoom({ label: "late-winner" });
    await drainUntilMirrored(roomId);
    await attachPlayers(roomId, 2);
    await driveFullLifecycle(roomId, { earlyFinish: false });
    await seedWinners(roomId, { winType: "full", count: 1 });
    return { roomId, validation: await validateShadowParity(roomId) };
  }),

  scenario("bingo-multi-line", "Multiple line winners", async () => {
    const { roomId } = await createHarnessRoom({ label: "multi-line" });
    await drainUntilMirrored(roomId);
    await attachPlayers(roomId, 3);
    await driveFullLifecycle(roomId);
    const seeded = await seedWinners(roomId, { winType: "line", count: 2 });
    return {
      roomId,
      validation: await validateShadowParity(roomId),
      detail: seeded,
    };
  }),

  scenario("bingo-multi-full", "Multiple full winners", async () => {
    const { roomId } = await createHarnessRoom({ label: "multi-full" });
    await drainUntilMirrored(roomId);
    await attachPlayers(roomId, 3);
    await driveFullLifecycle(roomId);
    const seeded = await seedWinners(roomId, { winType: "full", count: 2 });
    return {
      roomId,
      validation: await validateShadowParity(roomId),
      detail: seeded,
    };
  }),

  scenario("bingo-card-pool-1001", "Card pool 1001+", async () => {
    const n = await getPoolCardCount();
    if (n < 1001) {
      return {
        skipped: true,
        skipReason: `card_pool_cards=${n} < 1001`,
        roomId: null,
      };
    }
    const poolId = await getAnyPoolId();
    const { roomId } = await createHarnessRoom({ label: "pool-1001", poolId });
    await setRoomLifecycle(roomId, "waiting");
    await drainUntilMirrored(roomId);
    await driveFullLifecycle(roomId);
    const validation = await validateShadowParity(roomId);
    if (n < 1001) {
      validation.ok = false;
      validation.issues.push({
        severity: "hard",
        code: "pool_too_small",
        message: `pool cards ${n} < 1001`,
      });
    }
    return { roomId, validation, detail: { poolCards: n, poolId } };
  }),

  scenario("bingo-tournament", "Tournament room shadow", async () => {
    const existing = await findTournamentRoom();
    if (existing) {
      await forceEnqueue(existing);
      await forceDrain(100);
      const validation = await validateShadowParity(existing);
      return {
        roomId: existing,
        validation,
        detail: { source: "existing_tournament_or_finished" },
      };
    }
    const { roomId } = await createHarnessRoom({ label: "tournament-synthetic" });
    await driveFullLifecycle(roomId);
    return {
      roomId,
      validation: await validateShadowParity(roomId),
      detail: { source: "synthetic" },
    };
  }),

  scenario("bingo-restart-waiting", "Engine restart during waiting", async () => {
    const { roomId } = await createHarnessRoom({ label: "restart-waiting" });
    await setRoomLifecycle(roomId, "waiting", { lease: true });
    await drainUntilMirrored(roomId);
    // simulate engine loss
    await setRoomLifecycle(roomId, "waiting", { lease: false });
    await drainUntilMirrored(roomId);
    // reclaim
    await setRoomLifecycle(roomId, "waiting", { lease: true });
    await drainUntilMirrored(roomId);
    return { roomId, validation: await validateShadowParity(roomId) };
  }),

  scenario("bingo-restart-running", "Engine restart during running", async () => {
    const { roomId } = await createHarnessRoom({ label: "restart-running" });
    await setRoomLifecycle(roomId, "playing", { lease: true });
    await drainUntilMirrored(roomId);
    await setRoomLifecycle(roomId, "playing", { lease: false });
    await drainUntilMirrored(roomId);
    await setRoomLifecycle(roomId, "playing", { lease: true, leaseOwner: "shadow-regression-harness-b" });
    await drainUntilMirrored(roomId);
    await setRoomLifecycle(roomId, "finished", { lease: false });
    await drainUntilMirrored(roomId);
    return { roomId, validation: await validateShadowParity(roomId) };
  }),

  scenario("bingo-dup-shadow", "Duplicate shadow event", async () => {
    const { roomId } = await createHarnessRoom({ label: "dup-shadow" });
    await setRoomLifecycle(roomId, "waiting");
    await forceEnqueue(roomId);
    await forceEnqueue(roomId);
    await forceEnqueue(roomId);
    await forceDrain(50);
    const pending = await query(
      `SELECT count(*)::int AS n FROM platform.shadow_outbox
       WHERE room_id = $1 AND processed_at IS NULL AND dead_lettered_at IS NULL`,
      [roomId]
    );
    const sessions = await query(
      `SELECT count(*)::int AS n FROM platform.game_sessions WHERE id = $1`,
      [roomId]
    );
    const validation = await validateShadowParity(roomId);
    if (sessions.rows[0].n !== 1) {
      validation.ok = false;
      validation.issues.push({
        severity: "hard",
        code: "dup_created_sessions",
        message: `sessions=${sessions.rows[0].n}`,
      });
    }
    return {
      roomId,
      validation,
      detail: { pendingAfter: pending.rows[0].n, sessions: sessions.rows[0].n },
    };
  }),

  scenario("bingo-retry-shadow", "Retry shadow event", async () => {
    const { roomId } = await createHarnessRoom({ label: "retry-shadow" });
    await setRoomLifecycle(roomId, "playing", { lease: true });
    // Force a retry path: enqueue, mark error-like by re-enqueue after partial
    await forceEnqueue(roomId);
    await query(
      `UPDATE platform.shadow_outbox
       SET retry_count = 1, next_attempt_at = now(), last_error = 'harness-forced-retry'
       WHERE room_id = $1 AND processed_at IS NULL`,
      [roomId]
    );
    await forceDrain(50);
    await setRoomLifecycle(roomId, "finished", { lease: false });
    await forceEnqueue(roomId);
    await forceDrain(50);
    const validation = await validateShadowParity(roomId);
    return { roomId, validation };
  }),

  scenario("bingo-delayed-outbox", "Delayed outbox processing", async () => {
    const { roomId } = await createHarnessRoom({ label: "delayed-outbox" });
    await setRoomLifecycle(roomId, "waiting", { lease: true });
    await forceEnqueue(roomId);
    await delayPendingOutbox(roomId, 2);
    // immediate drain should no-op while delayed
    await forceDrain(20);
    await sleep(2100);
    await forceDrain(50);
    await setRoomLifecycle(roomId, "finished", { lease: false });
    await drainUntilMirrored(roomId);
    return { roomId, validation: await validateShadowParity(roomId) };
  }),

  scenario("bingo-settlement", "Settlement completed", async () => {
    const { roomId } = await createHarnessRoom({ label: "settlement" });
    await driveFullLifecycle(roomId);
    const validation = await validateShadowParity(roomId);
    const st = await query(
      `SELECT status FROM platform.session_settlement WHERE session_id = $1`,
      [roomId]
    );
    if (!st.rows[0] || st.rows[0].status !== "applied") {
      validation.ok = false;
      validation.issues.push({
        severity: "hard",
        code: "settlement_incomplete",
        message: "settlement not applied after finished",
      });
    }
    return { roomId, validation };
  }),

  scenario("bingo-commission", "Commission completed", async () => {
    // Prefer a finished room that already has commission rows (no wallet mutation).
    const existing = await query(
      `SELECT c.room_id
       FROM public.commissions_log c
       WHERE c.room_id IS NOT NULL
       ORDER BY c.created_at DESC NULLS LAST
       LIMIT 1`
    ).catch(() => ({ rows: [] }));

    if (existing.rows[0]?.room_id) {
      const roomId = existing.rows[0].room_id;
      await forceEnqueue(roomId);
      await forceDrain(50);
      const validation = await validateShadowParity(roomId);
      return {
        roomId,
        validation,
        detail: { source: "existing_commissions_log" },
      };
    }

    const { roomId } = await createHarnessRoom({ label: "commission-synthetic" });
    await driveFullLifecycle(roomId);
    const validation = await validateShadowParity(roomId);
    // Soft expectation: commission may be absent without live settle
    const hasComm = validation.meta?.commissionRows > 0;
    if (!hasComm) {
      validation.issues.push({
        severity: "soft",
        code: "commission_absent",
        message:
          "No commissions_log for synthetic room (expected without live settle path)",
      });
    }
    return {
      roomId,
      validation,
      detail: { source: "synthetic", hasComm },
    };
  }),
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// cleanup helper exported for runner
export { cancelHarnessRoom };
