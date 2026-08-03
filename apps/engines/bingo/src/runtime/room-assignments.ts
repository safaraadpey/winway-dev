/**
 * Per-room assignment indexes — never scan all tickets during draw processing.
 */

import type { TicketRow } from "../repositories/types.js";
import { normalizePoolCardId } from "../state/cardId.js";

export interface RoomAssignmentIndex {
  /** cardId → ticketIds active in this room */
  readonly assignmentsByCardId: ReadonlyMap<string, readonly string[]>;
  /** ticketId → cardId */
  readonly ticketCardId: ReadonlyMap<string, string>;
  /** ticketId → userId */
  readonly ticketUserId: ReadonlyMap<string, string>;
  readonly ticketCount: number;
  readonly distinctCardCount: number;
}

export function buildRoomAssignmentIndex(
  tickets: readonly TicketRow[]
): RoomAssignmentIndex {
  const byCard = new Map<string, string[]>();
  const ticketCardId = new Map<string, string>();
  const ticketUserId = new Map<string, string>();

  for (const t of tickets) {
    const cardId = normalizePoolCardId(t.pool_card_id);
    ticketCardId.set(t.id, cardId);
    ticketUserId.set(t.id, t.player_user_id);

    if (!byCard.has(cardId)) byCard.set(cardId, []);
    byCard.get(cardId)!.push(t.id);
  }

  return {
    assignmentsByCardId: byCard,
    ticketCardId,
    ticketUserId,
    ticketCount: tickets.length,
    distinctCardCount: byCard.size,
  };
}
