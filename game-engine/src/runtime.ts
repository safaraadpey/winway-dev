/**
 * Runtime-mode helpers.
 *
 * GAME_RUNTIME drives the migration strategy and the DB fallback guarantee:
 *   - legacy_db : DB pg_cron is authoritative; engine workers idle (no double run).
 *   - hybrid    : engine drives the loops but delegates business logic to DB RPCs.
 *   - engine    : engine executes ported business logic; DB RPCs remain as
 *                 fallback (re-enabling cron / flipping the flag restores them).
 */

import type { GameRuntime } from "./config/env.js";

export function isIdle(runtime: GameRuntime): boolean {
  return runtime === "legacy_db";
}

/** True when the engine should drive the loop (orchestration) at all. */
export function drivesLoops(runtime: GameRuntime): boolean {
  return runtime === "hybrid" || runtime === "engine";
}

/** True when business logic should run in TS rather than via DB RPC. */
export function executesBusinessLogic(runtime: GameRuntime): boolean {
  return runtime === "engine";
}
