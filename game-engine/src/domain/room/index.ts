/**
 * Room domain orchestration.
 *
 * Engine-mode port of fn_manage_waiting_rooms (public.fn_heartbeat_tick waiting half).
 * Live draw actions are owned by the room-loop actor — see domain/room-loop/runDrawCycle.ts.
 */

import type { Logger } from "../../metrics/logger.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";
import { addSecondsWithJitter } from "./drawScheduleJitter.js";

const FIRST_DRAW_DELAY_SEC = 7;
const DEFAULT_COUNTDOWN_SEC = 120;

export interface ManageWaitingResult {
  promoted: number;
  extended: number;
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
