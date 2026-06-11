/**
 * O(affected_cards) draw marking via global reverse number index
 * + per-room cardId → assignmentIds index.
 */

import { markBit } from "./masks.js";
import type { BitmaskMarkResult, CardMask, NumberIndexEntry } from "./types.js";

export interface MarkDrawInput {
  drawNumber: number;
  /** Global: number → [{ cardId, bitPosition }] */
  numberIndex: ReadonlyMap<number, readonly NumberIndexEntry[]>;
  /** Per-room: cardId → ticketIds (assignments) */
  assignmentsByCardId: ReadonlyMap<string, readonly string[]>;
  /** Mutable per-room masks (ticketId → mask). Updated in place. */
  maskByTicket: Map<string, CardMask>;
}

export function applyMarkForDrawBitmask(input: MarkDrawInput): BitmaskMarkResult {
  const drawNumber = Number(input.drawNumber);
  const entries = input.numberIndex.get(drawNumber) ?? [];
  const markRows: { ticket_id: string; value: number }[] = [];
  const affected = new Set<string>();

  for (const { cardId, bitPosition } of entries) {
    const ticketIds = input.assignmentsByCardId.get(cardId);
    if (!ticketIds || ticketIds.length === 0) continue;

    for (const ticketId of ticketIds) {
      const prev = input.maskByTicket.get(ticketId) ?? 0;
      const next = markBit(prev, bitPosition);
      input.maskByTicket.set(ticketId, next);
      markRows.push({ ticket_id: ticketId, value: drawNumber });
      if (next !== prev) affected.add(ticketId);
    }
  }

  return { markRows, affectedTicketIds: [...affected] };
}
