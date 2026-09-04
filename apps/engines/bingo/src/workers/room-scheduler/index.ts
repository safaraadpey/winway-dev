import { randomUUID } from "node:crypto";
import { manageWaitingRooms } from "../../domain/room/index.js";
import { repairUnsettledFinishedRooms } from "../../domain/room/janitorRepair.js";
import { recoverDueAutoBuySessions } from "../../finance/autoBuyRecover.js";
import { GameRepo } from "../../repositories/index.js";
import { redisKeysV2 } from "../../redis/keysV2.js";
import { acquireLeaderLock, releaseLeaderLock } from "../../redis/leaderLock.js";
import { executesBusinessLogic, isIdle } from "../../runtime.js";
import type { WorkerContext } from "../context.js";

/**
 * Room lifecycle (engine runtime): waiting→playing promotion + janitor only.
 * Live draw timing is owned by the room-loop actor — not this scheduler.
 *
 *   - legacy_db : idle (cron owns the loop; no double-draw).
 *   - hybrid    : engine drives cadence via DB RPCs (fn_heartbeat_tick).
 *   - engine    : manageWaitingRooms in TS; live draws via room-loop role.
 *
 * Redis leader lock prevents multiple replicas from promoting rooms concurrently.
 */
export function startRoomScheduler(ctx: WorkerContext): () => void {
  const { supabase, config, log, redis } = ctx;
  const repo = new GameRepo(supabase);
  const lockToken = randomUUID();
  const lockKey = redisKeysV2.lockWorkerScheduler();

  let stopped = false;
  let inFlight = false;
  let idleLogged = false;
  let redisLockDegraded = { value: false };
  let lastJanitorMs = 0;
  const worker = "room-scheduler";

  const maybeRunJanitor = async (): Promise<void> => {
    if (!executesBusinessLogic(config.runtime)) return;
    if (config.roomJanitorIntervalMs <= 0) return;
    const now = Date.now();
    if (now - lastJanitorMs < config.roomJanitorIntervalMs) return;
    lastJanitorMs = now;
    try {
      await repairUnsettledFinishedRooms(
        supabase,
        repo,
        log,
        config.roomJanitorBatchLimit,
        ctx.roomState
      );
    } catch (err) {
      log.error("room-janitor tick error", { error: errMessage(err) });
    }
  };

  const tick = async (): Promise<void> => {
    if (stopped || inFlight) return;

    if (isIdle(config.runtime)) {
      if (!idleLogged) {
        log.info("room-scheduler idle (GAME_RUNTIME=legacy_db); cron owns rooms");
        idleLogged = true;
      }
      return;
    }
    idleLogged = false;
    inFlight = true;

    let lockHeld = false;
    try {
      const lock = await acquireLeaderLock({
        redis,
        lockKey,
        ttlSec: config.schedulerLockTtlSec,
        token: lockToken,
        worker,
        log,
        degraded: redisLockDegraded,
        coordinationStrict: config.coordinationStrict,
        engineReplicaCount: config.engineReplicaCount,
      });
      if (!lock.proceed) return;
      lockHeld = lock.lockHeld;

      if (executesBusinessLogic(config.runtime)) {
        await manageWaitingRooms(repo, log, 50, ctx.roomState);
        await maybeRunJanitor();
        await recoverDueAutoBuySessions(supabase, log);
      } else {
        await callDbScheduler(ctx);
      }
    } catch (err) {
      log.error("room-scheduler tick error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await releaseLeaderLock({
        redis,
        lockKey,
        token: lockToken,
        lockHeld,
        worker,
        log,
      });
      inFlight = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), config.roomSchedulerIntervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * hybrid: drive the existing DB logic from the engine loop. public.fn_heartbeat_tick
 * runs both halves (fn_manage_waiting_rooms + fn_manage_room_live_actions) exactly
 * like pg_cron job 9 — only the trigger source changes.
 */
async function callDbScheduler(ctx: WorkerContext): Promise<void> {
  const { error } = await ctx.supabase.rpc("fn_heartbeat_tick");
  if (error) throw new Error(`fn_heartbeat_tick: ${error.message}`);
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
