/**
 * One-time DB load when a room enters the engine runtime.
 * After this, the draw loop must not re-fetch tickets/cards/marks/results.
 */

import { GameRepo } from "../repositories/index.js";
import { RoomRuntimeState, type RoomStateSnapshot } from "./room-state.js";

export interface LoadRoomSnapshotResult {
  state: RoomRuntimeState;
  loadDurationMs: number;
}

export async function loadRoomSnapshot(
  repo: GameRepo,
  roomId: string
): Promise<LoadRoomSnapshotResult> {
  const t0 = performance.now();

  const room = await repo.getRoom(roomId);
  if (!room) throw new Error(`loadRoomSnapshot: room ${roomId} not found`);

  const allTickets = await repo.getRoomTickets(roomId);
  const tickets = RoomRuntimeState.filterEvalTickets(allTickets);

  let templateDingPerNumber: number | null = null;
  if (room.room_template_id) {
    templateDingPerNumber = await repo.getTemplateDingPerNumber(room.room_template_id);
  }

  const ticketIds = tickets.map((t) => t.id);
  const markedByTicket = await repo.getMarksForTickets(ticketIds);
  const results = await repo.getResults(roomId);
  const drawnNumbers = await repo.getDrawnNumbers(roomId);
  const unprocessedDrawNumbers = await repo.getUnprocessedDrawNumbers(roomId);

  const existingLineTickets = new Set(
    results.filter((r) => r.win_type === "line").map((r) => r.ticket_id)
  );
  const existingFullTickets = new Set(
    results.filter((r) => r.win_type === "full").map((r) => r.ticket_id)
  );

  const snapshot: RoomStateSnapshot = {
    room,
    tickets,
    markedByTicket,
    existingLineTickets,
    existingFullTickets,
    drawnNumbers,
    unprocessedDrawNumbers: new Set(unprocessedDrawNumbers),
    templateDingPerNumber,
  };

  const state = new RoomRuntimeState(snapshot);

  return {
    state,
    loadDurationMs: Math.round((performance.now() - t0) * 100) / 100,
  };
}
