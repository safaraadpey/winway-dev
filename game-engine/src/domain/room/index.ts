/**
 * Room domain orchestration.
 *
 * Engine-mode ports of the two halves of public.fn_heartbeat_tick:
 *   - manageWaitingRooms     ← game_core.fn_manage_waiting_rooms
 *   - manageRoomLiveActions  ← game_core.fn_manage_room_live_actions
 *
 * Persistence goes through GameRepo; the provably-fair number choice uses the
 * pure core (pickNextNumber). Draw rows still fire the DB trigger
 * trg_after_draw_enqueue which enqueues draw_jobs — exactly as today — so the
 * existing draw pipeline keeps working unchanged.
 */

import { pickNextNumber } from "../../core/index.js";
import type { RoomLoopMode } from "../../config/env.js";
import { wakeDrawProcessor } from "../../runtime/draw-processor-wake.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { Logger } from "../../metrics/logger.js";
import { GameRepo, parseBytea } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";
import { isActorRoom } from "../room-loop/loopMode.js";
import { addSecondsWithJitter } from "./drawScheduleJitter.js";
import { finishExhaustedRoom } from "./reconcileWinners.js";

const FIRST_DRAW_DELAY_SEC = 7; // fn_manage_waiting_rooms: first draw after start
const DEFAULT_DRAW_INTERVAL_SEC = 3;
const DEFAULT_COUNTDOWN_SEC = 120;

export interface ManageWaitingResult {
  promoted: number;
  extended: number;
}

function drawIntervalSec(meta: Record<string, unknown> | null): number {
  const raw = meta?.["draw_interval_sec"];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Math.max(Number.isFinite(n) ? Math.trunc(n) : DEFAULT_DRAW_INTERVAL_SEC, 1);
}

function addSeconds(base: Date, seconds: number): string {
  return new Date(base.getTime() + seconds * 1000).toISOString();
}

/**
 * Promote due waiting rooms that reached min_players to `playing` and schedule
 * their first draw; rooms that did not reach min_players have their countdown
 * extended. Mirrors fn_manage_waiting_rooms(p_limit, p_capture=false).
 */
export async function manageWaitingRooms(
  repo: GameRepo,
  log: Logger,
  limit = 50,
  stateManager?: RoomStateManager
): Promise<ManageWaitingResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const due = await repo.getWaitingRoomsDue(limit, nowIso);

  let promoted = 0;
  let extended = 0;

  for (const room of due) {
    const players = await repo.countDistinctActivePlayers(room.id);
    const minPlayers = room.min_players ?? 1;

    if (players >= minPlayers) {
      const ok = await repo.setRoomPlaying(
        room.id,
        addSecondsWithJitter(now, FIRST_DRAW_DELAY_SEC, room.id),
        nowIso
      );
      if (ok) {
        promoted += 1;
        stateManager?.preload(room.id);
      }
    } else {
      await repo.extendRoomCountdown(
        room.id,
        addSeconds(now, room.countdown_sec ?? DEFAULT_COUNTDOWN_SEC),
        nowIso
      );
      extended += 1;
    }
  }

  if (promoted > 0 || extended > 0) {
    log.info("room-scheduler waiting", { promoted, extended });
  }
  return { promoted, extended };
}

export interface ManageLiveResult {
  drew: number;
  finished: number;
}

/**
 * For each playing room whose next_draw_at is due: apply backpressure (skip if
 * a prior draw is still unprocessed), pick the next provably-fair number, insert
 * the draw row, and advance next_draw_at. When all 90 numbers are exhausted the
 * room is finished. Mirrors fn_manage_room_live_actions.
 */
export async function manageRoomLiveActions(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  limit = 200,
  stateManager?: RoomStateManager,
  roomLoopMode: RoomLoopMode = "scheduler_queue"
): Promise<ManageLiveResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rooms = await repo.getPlayingRoomsDue(limit, nowIso);

  let drew = 0;
  let finished = 0;

  for (const room of rooms) {
    try {
      const liveRoom = await repo.getRoom(room.id);
      if (!liveRoom || liveRoom.status !== "playing") continue;
      // Actor-mode rooms are driven by the room-loop owner; the scheduler must
      // not insert draws for them (would double-drive the clock).
      if (isActorRoom(liveRoom, roomLoopMode)) continue;
      if (await repo.hasUnpaidFullWinner(room.id)) {
        stateManager?.evict(room.id);
        continue;
      }

      const seed = parseBytea(room.room_seed);
      if (!seed) {
        log.error("room has no room_seed but is playing", { roomId: room.id });
        continue;
      }

      let state = stateManager?.get(room.id);

      let dbDrawn: number[];
      if (state) {
        const [drawn, unprocessed] = await Promise.all([
          repo.getDrawnNumbers(room.id),
          repo.getUnprocessedDrawNumbers(room.id),
        ]);
        state.syncDrawSchedulerState(drawn, unprocessed);
        dbDrawn = drawn;
      } else {
        dbDrawn = await repo.getDrawnNumbers(room.id);
      }

      const next = pickNextNumber(seed, dbDrawn);

      if (next === null) {
        const outcome = await finishExhaustedRoom(
          supabase,
          repo,
          log,
          room.id,
          stateManager
        );
        if (outcome === "settled" || outcome === "finished") {
          finished += 1;
        }
        continue;
      }

      const intervalSec = drawIntervalSec(room.meta);
      const outcome = await repo.insertDrawIfReady(
        room.id,
        next,
        nowIso,
        intervalSec
      );

      if (outcome === "backpressure" || outcome === "not_playing") {
        continue;
      }

      if (outcome === "inserted") {
        if (!state && stateManager) {
          state = await stateManager.ensureLoaded(room.id);
        }
        state?.recordDrawInserted(next);
        wakeDrawProcessor("enqueue");
        drew += 1;
        continue;
      }

      log.warn("scheduler skipped duplicate draw number", {
        roomId: room.id,
        number: next,
      });
      if (state) {
        const [drawn, unprocessed] = await Promise.all([
          repo.getDrawnNumbers(room.id),
          repo.getUnprocessedDrawNumbers(room.id),
        ]);
        state.syncDrawSchedulerState(drawn, unprocessed);
        dbDrawn = drawn;
      }
      await repo.setNextDrawAt(
        room.id,
        addSecondsWithJitter(now, intervalSec, room.id),
        nowIso
      );
    } catch (err) {
      log.error("room-scheduler live room error", {
        roomId: room.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (drew > 0 || finished > 0) {
    log.info("room-scheduler live", { drew, finished });
  }
  return { drew, finished };
}
