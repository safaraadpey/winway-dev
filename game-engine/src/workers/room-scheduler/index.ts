import { randomUUID } from "node:crypto";
import {
  manageRoomLiveActions,
  manageWaitingRooms,
} from "../../domain/room/index.js";
import { repairUnsettledFinishedRooms } from "../../domain/room/janitorRepair.js";
import { GameRepo } from "../../repositories/index.js";
import { redisKeys } from "../../redis/keys.js";
import { releaseLock, tryAcquireLock } from "../../redis/locks.js";
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
  let redisLockDegraded = false;
  let lastJanitorMs = 0;

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
      if (redis) {
        try {
          const haveLock = await tryAcquireLock(
            redis,
            lockKey,
            config.drawProcessorLockTtlSec,
            lockToken
          );
          lockHeld = haveLock;
          if (!haveLock) return;
        } catch (lockErr) {
          if (!redisLockDegraded) {
            redisLockDegraded = true;
            log.warn("room-scheduler redis lock failed; continuing single-instance mode", {
              error: errMessage(lockErr),
            });
          }
        }
      }

      if (executesBusinessLogic(config.runtime)) {
        await manageWaitingRooms(repo, log, 50, ctx.roomState);
        await manageRoomLiveActions(supabase, repo, log, 200, ctx.roomState);
        await maybeRunJanitor();
      } else {
        await callDbScheduler(ctx);
      }
    } catch (err) {
      log.error("room-scheduler tick error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (redis && lockHeld) {
        await releaseLock(redis, lockKey, lockToken).catch((err: unknown) =>
          log.error("room-scheduler lock release failed", {
            error: errMessage(err),
          })
        );
      }
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
