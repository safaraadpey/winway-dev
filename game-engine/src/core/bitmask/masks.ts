import type { CardDefinitionMasks, CardMask } from "./types.js";
import { assignBitPositions, type LayoutCell } from "./layout.js";

/** OR bits for cells in a given row. */
function rowMask(cells: readonly { rowNo: number; bitPosition: number }[], rowNo: number): CardMask {
  let mask = 0;
  for (const c of cells) {
    if (c.rowNo === rowNo) mask |= 1 << c.bitPosition;
  }
  return mask;
}

/** Compute precomputed win masks from raw card_numbers rows. */
export function computeCardDefinitionMasks(
  cardId: string,
  cells: readonly LayoutCell[]
): CardDefinitionMasks {
  const positioned = assignBitPositions(cells);
  const line1Mask = rowMask(positioned, 1);
  const line2Mask = rowMask(positioned, 2);
  const line3Mask = rowMask(positioned, 3);
  const fullMask = line1Mask | line2Mask | line3Mask;

  return {
    cardId,
    line1Mask,
    line2Mask,
    line3Mask,
    fullMask,
    cellCount: positioned.length,
  };
}

/** Apply a single bit mark. */
export function markBit(mask: CardMask, bitPosition: number): CardMask {
  return mask | (1 << bitPosition);
}

/** Build mask from a set of marked bingo values using value→bit map. */
export function maskFromMarkedValues(
  marked: ReadonlySet<number>,
  valueToBit: ReadonlyMap<number, number>
): CardMask {
  let mask = 0;
  for (const value of marked) {
    const bit = valueToBit.get(value);
    if (bit !== undefined) mask |= 1 << bit;
  }
  return mask;
}

/** True when all bits in patternMask are set in cardMask. */
export function maskCovers(cardMask: CardMask, patternMask: CardMask): boolean {
  return (cardMask & patternMask) === patternMask;
}

/** Any row fully marked? */
export function hasLineWin(cardMask: CardMask, def: CardDefinitionMasks): boolean {
  return (
    maskCovers(cardMask, def.line1Mask) ||
    maskCovers(cardMask, def.line2Mask) ||
    maskCovers(cardMask, def.line3Mask)
  );
}

/** All cells marked? */
export function hasFullWin(cardMask: CardMask, def: CardDefinitionMasks): boolean {
  return maskCovers(cardMask, def.fullMask);
}
