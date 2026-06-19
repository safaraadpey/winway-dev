/**
 * Room domain orchestration.
 *
 * Engine-mode port of fn_manage_waiting_rooms (public.fn_heartbeat_tick waiting half).
 * Live draw actions are owned by the room-loop actor — see domain/room-loop/runDrawCycle.ts.
 */

import type { Logger } from "../../metrics/logger.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";
import type { RoomRow } from "../../repositories/types.js";
import { addSecondsWithJitter } from "./drawScheduleJitter.js";

const FIRST_DRAW_DELAY_SEC = 7;
const DEFAULT_COUNTDOWN_SEC = 120;

export interface ManageWaitingResult {
  promoted: number;
  extended: number;
  promotedMaxCapacity: number;
}

function addSeconds(base: Date, seconds: number): string {
  return new Date(base.getTime() + seconds * 1000).toISOString();
}

type WaitingSchedulerAction =
  | "promote"
  | "promote_max_capacity"
  | "extend"
  | "skip";

function logWaitingRoomScheduler(
  log: Logger,
  room: {
    id: string;
    starts_at: string | null;
    waiting_started_at: string | null;
    max_players?: number | null;
  },
  activePlayers: number,
  minPlayers: number,
  action: WaitingSchedulerAction
): void {
  // TEMP diagnostics: remove after waiting-room lifecycle investigation.
  log.info("[waitingRoomScheduler]", {
    roomId: room.id,
    starts_at: room.starts_at,
    waiting_started_at: room.waiting_started_at,
    max_players: room.max_players ?? null,
    active_players: activePlayers,
    min_players: minPlayers,
    action,
  });
}

async function promoteWaitingRoom(
  repo: GameRepo,
  log: Logger,
  room: RoomRow,
  players: number,
  minPlayers: number,
  now: Date,
  nowIso: string,
  action: "promote" | "promote_max_capacity",
  stateManager?: RoomStateManager
): Promise<boolean> {
  const ok = await repo.setRoomPlaying(
    room.id,
    addSecondsWithJitter(now, FIRST_DRAW_DELAY_SEC, room.id),
    nowIso
  );
  if (ok) {
    logWaitingRoomScheduler(log, room, players, minPlayers, action);
    stateManager?.preload(room.id);
    return true;
  }
  logWaitingRoomScheduler(log, room, players, minPlayers, "skip");
  return false;
}

/**
 * Promote waiting rooms at max capacity immediately; then promote due waiting rooms
 * that reached min_players to `playing`; rooms that did not reach min_players have
 * their countdown extended. Mirrors fn_manage_waiting_rooms(p_limit, p_capture=false).
 */
export async function manageWaitingRooms(
  repo: GameRepo,
  log: Logger,
  limit = 50,
  stateManager?: RoomStateManager
): Promise<ManageWaitingResult> {
  const now = new Date();
  const nowIso = now.toISOString();

  let promotedMaxCapacity = 0;
  const atMaxCapacity = await repo.getWaitingRoomsAtMaxCapacity(limit);
  for (const room of atMaxCapacity) {
    const maxPlayers = room.max_players;
    if (maxPlayers == null) continue;

    const players = await repo.countDistinctActivePlayers(room.id);
    const minPlayers = room.min_players ?? 1;
    if (players < maxPlayers) continue;

    const ok = await promoteWaitingRoom(
      repo,
      log,
      room,
      players,
      minPlayers,
      now,
      nowIso,
      "promote_max_capacity",
      stateManager
    );
    if (ok) promotedMaxCapacity += 1;
  }

  let promoted = 0;
  let extended = 0;
  const due = await repo.getWaitingRoomsDue(limit, nowIso);

  for (const room of due) {
    const players = await repo.countDistinctActivePlayers(room.id);
    const minPlayers = room.min_players ?? 1;

    if (players >= minPlayers) {
      const ok = await promoteWaitingRoom(
        repo,
        log,
        room,
        players,
        minPlayers,
        now,
        nowIso,
        "promote",
        stateManager
      );
      if (ok) promoted += 1;
    } else {
      const ok = await repo.extendRoomCountdown(
        room.id,
        addSeconds(now, room.countdown_sec ?? DEFAULT_COUNTDOWN_SEC),
        nowIso
      );
      if (ok) {
        extended += 1;
        logWaitingRoomScheduler(log, room, players, minPlayers, "extend");
      } else {
        logWaitingRoomScheduler(log, room, players, minPlayers, "skip");
      }
    }
  }

  if (promoted > 0 || extended > 0 || promotedMaxCapacity > 0) {
    log.info("room-scheduler waiting", {
      promoted,
      extended,
      promotedMaxCapacity,
    });
  }
  return { promoted, extended, promotedMaxCapacity };
}
