/**
 * One-time DB load when a room enters the engine runtime.
 * After this, the draw loop must not re-fetch tickets/cards/marks/results.
 */

import { GameRepo } from "../repositories/index.js";
import { normalizePoolCardId } from "./cardId.js";
import {
  type CardCell,
  RoomRuntimeState,
  type RoomStateSnapshot,
} from "./room-state.js";

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
  const poolCardIds = [
    ...new Set(tickets.map((t) => normalizePoolCardId(t.pool_card_id))),
  ];
  const cardNumbers = await repo.getCardNumbers(poolCardIds);

  const cellsByCard = new Map<string, CardCell[]>();
  for (const cn of cardNumbers) {
    const cardId = normalizePoolCardId(cn.pool_card_id);
    if (!cellsByCard.has(cardId)) cellsByCard.set(cardId, []);
    cellsByCard.get(cardId)!.push({ value: cn.value, rowNo: cn.row_no });
  }

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
    cellsByCard,
    markedByTicket,
    existingLineTickets,
    existingFullTickets,
    drawnNumbers,
    unprocessedDrawNumbers: new Set(unprocessedDrawNumbers),
    templateDingPerNumber,
  };

  const state = new RoomRuntimeState(snapshot);
  if (RoomRuntimeState.isBroken(state)) {
    throw new Error(
      `loadRoomSnapshot: 0 card cells loaded for room ${roomId} (${tickets.length} tickets)`
    );
  }

  return {
    state,
    loadDurationMs: Math.round((performance.now() - t0) * 100) / 100,
  };
}
