import { randomUUID } from "node:crypto";
import {
  manageRoomLiveActions,
  manageWaitingRooms,
} from "../../domain/room/index.js";
import { repairUnsettledFinishedRooms } from "../../domain/room/janitorRepair.js";
import { GameRepo } from "../../repositories/index.js";
import { redisKeys } from "../../redis/keys.js";
import { acquireLeaderLock, releaseLeaderLock } from "../../redis/leaderLock.js";
import {
  registerRoomSchedulerWake,
  type RoomSchedulerWakeReason,
} from "../../runtime/room-scheduler-wake.js";
import { executesBusinessLogic, isIdle } from "../../runtime.js";
import type { WorkerContext } from "../context.js";

/**
 * Room lifecycle: waiting→playing promotion + live draw scheduling. Replaces
 * pg_cron job 9 (public.fn_heartbeat_tick).
 *
 *   - legacy_db : idle (cron owns the loop; no double-draw).
 *   - hybrid    : engine drives the cadence but calls the DB RPCs
 *                 (fn_manage_waiting_rooms + fn_manage_room_live_actions).
 *   - engine    : engine runs the TS port (domain/room) end to end.
 *
 * Redis leader lock prevents multiple replicas from inserting draws concurrently.
 */
export function startRoomScheduler(ctx: WorkerContext): () => void {
  const { supabase, config, log, redis } = ctx;
  const repo = new GameRepo(supabase);
  const lockToken = randomUUID();
  const lockKey = redisKeys.schedulerLeader();

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
        log,
        config.roomJanitorBatchLimit
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
        ttlSec: config.drawProcessorLockTtlSec,
        token: lockToken,
        worker,
        log,
        degraded: redisLockDegraded,
      });
      if (!lock.proceed) return;
      lockHeld = lock.lockHeld;

      if (executesBusinessLogic(config.runtime)) {
        await manageWaitingRooms(repo, log, 50, ctx.roomState);
        await manageRoomLiveActions(
          supabase,
          repo,
          log,
          200,
          ctx.roomState,
          config.roomLoopMode
        );
        await maybeRunJanitor();
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

  // Event-driven wake: when a draw finalizes, backpressure clears — run the
  // scheduler immediately instead of waiting for the next poll. Debounced via
  // the inFlight guard inside tick(); coalesced wakes are harmless (idempotent).
  let wakeScheduled = false;
  const onWake = (reason: RoomSchedulerWakeReason): void => {
    if (stopped || reason === "poll") return;
    if (wakeScheduled) return;
    wakeScheduled = true;
    queueMicrotask(() => {
      wakeScheduled = false;
      void tick();
    });
  };
  const unregisterWake = registerRoomSchedulerWake(onWake);

  void tick();
  const timer = setInterval(() => void tick(), config.roomSchedulerIntervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
    unregisterWake();
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
