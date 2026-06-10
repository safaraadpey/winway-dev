/**
 * Merge authoritative marks/results from DB into in-memory room state.
 * Used on reload, periodic checkpoint boundaries, and forced recovery.
 */

import type { GameRepo } from "../repositories/index.js";
import type { RoomRuntimeState } from "./room-state.js";

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
  state.syncExistingResults(dbResults);
  if (room) state.room = room;
}
