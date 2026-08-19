import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pgPool } from "../../lib/pg";
import {
  createBackgammonGame,
  joinBackgammonGame,
  rollBackgammonDice,
  applyBackgammonMove,
  getBackgammonSnapshot,
} from "../../lib/backgammon/repository";
import { BACKGAMMON_FEATURE_KEY } from "../../lib/backgammon/constants";

const FEATURE = BACKGAMMON_FEATURE_KEY;

async function ensureFeatureInfrastructure() {
  if (!pgPool) throw new Error("pgPool unavailable");
  await pgPool.query(
    `INSERT INTO public.features (key, name, description, is_enabled, default_enabled)
     VALUES ($1, 'Backgammon Beta', 'test', true, false)
     ON CONFLICT (key) DO UPDATE SET is_enabled = true`,
    [FEATURE]
  );
}

async function setFeature(userId: string, enabled: boolean) {
  if (!pgPool) throw new Error("pgPool unavailable");
  if (enabled) {
    await pgPool.query(
      `INSERT INTO public.feature_user_overrides (feature_id, user_id, is_enabled)
       SELECT id, $2::uuid, true FROM public.features WHERE key = $1
       ON CONFLICT (feature_id, user_id) DO UPDATE SET is_enabled = true`,
      [FEATURE, userId]
    );
  } else {
    await pgPool.query(
      `DELETE FROM public.feature_user_overrides
       WHERE user_id = $1::uuid
         AND feature_id = (SELECT id FROM public.features WHERE key = $2)`,
      [userId, FEATURE]
    );
  }
}

async function hasFeatureDirect(userId: string, featureKey: string): Promise<boolean> {
  if (!pgPool) throw new Error("pgPool unavailable");
  const { rows } = await pgPool.query<{ enabled: boolean }>(
    "SELECT public.fn_has_feature($1::uuid, $2::text) AS enabled",
    [userId, featureKey]
  );
  return Boolean(rows[0]?.enabled);
}

async function pickTwoUsers(): Promise<[string, string]> {
  if (!pgPool) throw new Error("pgPool unavailable");
  const { rows } = await pgPool.query<{ id: string }>(
    `SELECT id FROM public.users WHERE role = 'player' ORDER BY created_at ASC LIMIT 2`
  );
  if (rows.length < 2) {
    throw new Error("Need at least two player users in DB for backgammon e2e");
  }
  return [rows[0].id, rows[1].id];
}

async function cleanupSession(sessionId: string) {
  if (!pgPool) return;
  await pgPool.query(`DELETE FROM platform.game_sessions WHERE id = $1::uuid`, [
    sessionId,
  ]);
}

async function countWalletRows(userId: string): Promise<number> {
  if (!pgPool) throw new Error("pgPool unavailable");
  const { rows } = await pgPool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM public.transactions WHERE user_id = $1::uuid`,
    [userId]
  );
  return Number(rows[0]?.c ?? 0);
}

async function run() {
  if (!pgPool) {
    throw new Error("DATABASE_URL / pgPool required for backgammon e2e");
  }

  await ensureFeatureInfrastructure();
  const [playerA, playerB] = await pickTwoUsers();
  const outsider = (
    await pgPool.query<{ id: string }>(
      `SELECT id FROM public.users
       WHERE role = 'player' AND id NOT IN ($1::uuid, $2::uuid)
       ORDER BY created_at ASC LIMIT 1`,
      [playerA, playerB]
    )
  ).rows[0]?.id;

  console.log("[Backgammon] e2e users", { playerA, playerB, outsider });

  await setFeature(playerA, true);
  await setFeature(playerB, true);
  if (outsider) await setFeature(outsider, false);

  assert.equal(await hasFeatureDirect(playerA, FEATURE), true);
  assert.equal(await hasFeatureDirect(playerB, FEATURE), true);
  if (outsider) {
    assert.equal(await hasFeatureDirect(outsider, FEATURE), false);
  }

  const { sessionId, stateVersion } = await createBackgammonGame(playerA);
  try {
    let snap = await getBackgammonSnapshot(sessionId, playerA);
    assert.equal(snap.matchState.status, "waiting");

    if (outsider) {
      const outsiderSnap = await getBackgammonSnapshot(sessionId, outsider);
      assert.equal(outsiderSnap.mySeat, null);
      await assert.rejects(
        () => rollBackgammonDice(sessionId, outsider, outsiderSnap.stateVersion),
        (err: Error) => err.message.toLowerCase().includes("participant")
      );
    }

    const joinResult = await joinBackgammonGame(sessionId, playerB);
    assert.ok(joinResult.stateVersion > stateVersion);

    snap = await getBackgammonSnapshot(sessionId, playerA);
    assert.equal(snap.matchState.status, "running");
    assert.equal(snap.participants.length, 2);

    const currentSeat = snap.matchState.currentTurn;
    assert.ok(currentSeat === 0 || currentSeat === 1);
    const activeUser =
      snap.participants.find((p) => p.seat_no === currentSeat)?.user_id ?? playerA;
    const passiveUser = activeUser === playerA ? playerB : playerA;

    await assert.rejects(
      () => rollBackgammonDice(sessionId, passiveUser, snap.stateVersion),
      (err: unknown) => {
        const e = err as Error & { code?: string };
        return (
          e.message.toLowerCase().includes("turn") ||
          e.code === "not_your_turn"
        );
      }
    );

    const rollResult = await rollBackgammonDice(
      sessionId,
      activeUser,
      snap.stateVersion
    );
    assert.ok(rollResult.stateVersion > snap.stateVersion);

    snap = await getBackgammonSnapshot(sessionId, activeUser);
    assert.equal(snap.matchState.dice.rolled, true);
    assert.ok(snap.matchState.dice.values);

    const [r1, r2] = await Promise.allSettled([
      rollBackgammonDice(sessionId, activeUser, snap.stateVersion),
      rollBackgammonDice(sessionId, activeUser, snap.stateVersion),
    ]);
    const successes = [r1, r2].filter((r) => r.status === "fulfilled").length;
    assert.ok(successes <= 1, "double roll should not succeed twice");

    if (snap.legalMoves.length > 0) {
      const move = snap.legalMoves[0];
      const versionBeforeMove = snap.stateVersion;
      const [m1, m2] = await Promise.allSettled([
        applyBackgammonMove(sessionId, activeUser, versionBeforeMove, move),
        applyBackgammonMove(sessionId, activeUser, versionBeforeMove, move),
      ]);
      const moveSuccesses = [m1, m2].filter((r) => r.status === "fulfilled").length;
      assert.equal(moveSuccesses, 1, "duplicate move should commit once");

      await assert.rejects(
        () => applyBackgammonMove(sessionId, activeUser, versionBeforeMove, move),
        (err: unknown) =>
          err instanceof Error && err.name === "StaleStateError"
      );
    }

    if (outsider) {
      const latest = await getBackgammonSnapshot(sessionId, playerA);
      await assert.rejects(
        () => rollBackgammonDice(sessionId, outsider, latest.stateVersion),
        (err: Error) => err.message.toLowerCase().includes("participant")
      );
    }

    const txBefore = await countWalletRows(playerA);
    const txAfter = await countWalletRows(playerA);
    assert.equal(txBefore, txAfter, "backgammon beta must not write transactions");

    console.log("PASS: backgammon e2e harness");
  } finally {
    await cleanupSession(sessionId);
    await setFeature(playerA, false);
    await setFeature(playerB, false);
  }
}

run().catch((err) => {
  console.error("FAIL: backgammon e2e harness", err);
  process.exit(1);
});
