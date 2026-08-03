/**
 * Bitmask win evaluation — O(1) per ticket via precomputed masks.
 * Bitmask win evaluation — line/full detection + first-line gating.
 */

import { hasFullWin, hasLineWin } from "./masks.js";
import type { CardDefinitionMasks, CardMask } from "./types.js";
import type { EvaluateOutput, WinResult } from "../evaluation-types.js";

export interface BitmaskEvaluateInput {
  drawNumber: number;
  firstLineDrawNumber: number | null;
  /** ticketId → current 15-bit mask */
  maskByTicket: ReadonlyMap<string, CardMask>;
  /** ticketId → cardId */
  ticketCardId: ReadonlyMap<string, string>;
  /** ticketId → userId */
  ticketUserId: ReadonlyMap<string, string>;
  /** Global card definitions (shared, immutable). */
  cardDefs: ReadonlyMap<string, CardDefinitionMasks>;
  existingLineTickets?: ReadonlySet<string>;
  existingFullTickets?: ReadonlySet<string>;
  /** Only evaluate these tickets (draw hot path). Omit to evaluate all. */
  affectedTicketIds?: ReadonlySet<string>;
}

export function evaluateRoomAfterDrawBitmask(
  input: BitmaskEvaluateInput
): EvaluateOutput {
  const existingLine = input.existingLineTickets ?? new Set<string>();
  const existingFull = input.existingFullTickets ?? new Set<string>();
  const lineGateOpen =
    input.firstLineDrawNumber === null ||
    input.firstLineDrawNumber === input.drawNumber;

  // Match SQL fn_evaluate_room_after_draw: evaluate every ticket, not only draw-affected ones.
  // A ticket can become eligible for line/full on a draw that does not mark it
  // (e.g. line gate opens on first_line_draw_number matching this draw).
  const ticketIds = input.affectedTicketIds
    ? [...input.affectedTicketIds]
    : [...input.ticketCardId.keys()];

  const newResults: WinResult[] = [];
  let lineRecorded = false;
  let fullRecorded = false;

  for (const ticketId of ticketIds) {
    const cardId = input.ticketCardId.get(ticketId);
    const userId = input.ticketUserId.get(ticketId);
    const mask = input.maskByTicket.get(ticketId) ?? 0;
    if (!cardId || !userId) continue;

    const def = input.cardDefs.get(cardId);
    if (!def) continue;

    if (
      hasLineWin(mask, def) &&
      !existingLine.has(ticketId) &&
      lineGateOpen
    ) {
      newResults.push({ ticketId, userId, winType: "line" });
      lineRecorded = true;
    }

    if (hasFullWin(mask, def) && !existingFull.has(ticketId)) {
      newResults.push({ ticketId, userId, winType: "full" });
      fullRecorded = true;
    }
  }

  return {
    newResults,
    setFirstLineDrawNumber:
      input.firstLineDrawNumber === null && lineRecorded,
    fullWinnerThisDraw: fullRecorded,
  };
}
