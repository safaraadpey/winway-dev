import {
  manageRoomLiveActions,
  manageWaitingRooms,
} from "../../domain/room/index.js";
import { GameRepo } from "../../repositories/index.js";
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
 * A Redis leader lock should gate this when running multiple replicas (B12);
 * single-instance mode is safe as-is.
 */
export function startRoomScheduler(ctx: WorkerContext): () => void {
  const { supabase, config, log } = ctx;
  const repo = new GameRepo(supabase);

  let stopped = false;
  let inFlight = false;
  let idleLogged = false;

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

    try {
      if (executesBusinessLogic(config.runtime)) {
        await manageWaitingRooms(repo, log, 50);
        await manageRoomLiveActions(repo, log, 200);
      } else {
        await callDbScheduler(ctx);
      }
    } catch (err) {
      log.error("room-scheduler tick error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
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
