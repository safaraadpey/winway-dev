/**
 * Bitmask card model — 15 active cells on a UK Housie 3×9 card.
 *
 * Position layout (row-major, 5 numbers per row):
 *   Row 1: bits 0–4
 *   Row 2: bits 5–9
 *   Row 3: bits 10–14
 */

/** 15-bit card mask (stored as uint16-safe integer). */
export type CardMask = number;

/** Single cell on a global card definition. */
export interface CardCellDef {
  value: number;
  rowNo: 1 | 2 | 3;
  colNo: number;
  bitPosition: number;
}

/** Precomputed win masks for one global card template. */
export interface CardDefinitionMasks {
  cardId: string;
  line1Mask: CardMask;
  line2Mask: CardMask;
  line3Mask: CardMask;
  fullMask: CardMask;
  cellCount: number;
}

/** Reverse-index entry: one card position for a drawn number. */
export interface NumberIndexEntry {
  cardId: string;
  bitPosition: number;
}

/** Per-room assignment: ticket owns a global card template. */
export interface RoomCardAssignment {
  assignmentId: string;
  cardId: string;
  userId: string;
  mask: CardMask;
}

/** Result of a single draw mark operation (bitmask path). */
export interface BitmaskMarkResult {
  /** Rows for marks table audit trail. */
  markRows: { ticket_id: string; value: number }[];
  /** Ticket ids whose mask changed this draw. */
  affectedTicketIds: string[];
}
