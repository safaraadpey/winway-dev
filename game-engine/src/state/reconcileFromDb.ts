/**
 * Merge authoritative marks/results from DB into in-memory room state.
 * Used on reload, periodic checkpoint boundaries, and forced recovery.
 */

import type { GameRepo } from "../repositories/index.js";
import type { RoomRuntimeState } from "./room-state.js";

/** Room row + results before every evaluate (first_line gate, existing winners). */
export async function refreshRoomAuthorityFromDb(
  repo: GameRepo,
  state: RoomRuntimeState
): Promise<void> {
  const [room, dbResults] = await Promise.all([
    repo.getRoom(state.roomId),
    repo.getResults(state.roomId),
  ]);
  if (room) state.room = room;
  state.replaceExistingResultsFromDb(dbResults);
}

export async function reconcileRuntimeStateFromDb(
  repo: GameRepo,
  state: RoomRuntimeState
): Promise<void> {
  const ticketIds = state.getTickets().map((t) => t.id);
  const [dbMarks, dbResults, room] = await Promise.all([
    repo.getMarksForTickets(ticketIds),
    repo.getResults(state.roomId),
    repo.getRoom(state.roomId),
  ]);
  state.mergeMarksFromDb(dbMarks);
  state.replaceExistingResultsFromDb(dbResults);
  if (room) state.room = room;
}
