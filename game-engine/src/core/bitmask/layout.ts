/**
 * Deterministic bit-position layout from housie row/col coordinates.
 * Matches SQL fn_backfill_card_bitmask_definitions ordering.
 */

export interface LayoutCell {
  value: number;
  rowNo: number;
  colNo: number;
}

export interface CardCellWithBit {
  value: number;
  rowNo: 1 | 2 | 3;
  colNo: number;
  bitPosition: number;
}

const ROW_BIT_OFFSET: Record<number, number> = { 1: 0, 2: 5, 3: 10 };

/** Assign bit positions 0–14 from row_no + col_no (sorted within row). */
export function assignBitPositions(cells: readonly LayoutCell[]): CardCellWithBit[] {
  const byRow = new Map<number, LayoutCell[]>();
  for (const c of cells) {
    if (c.rowNo < 1 || c.rowNo > 3) continue;
    if (!byRow.has(c.rowNo)) byRow.set(c.rowNo, []);
    byRow.get(c.rowNo)!.push(c);
  }

  const out: CardCellWithBit[] = [];
  for (const rowNo of [1, 2, 3] as const) {
    const rowCells = byRow.get(rowNo) ?? [];
    rowCells.sort((a, b) => a.colNo - b.colNo);
    const offset = ROW_BIT_OFFSET[rowNo] ?? 0;
    rowCells.forEach((c, i) => {
      out.push({
        value: c.value,
        rowNo: rowNo as 1 | 2 | 3,
        colNo: c.colNo,
        bitPosition: offset + i,
      });
    });
  }
  return out;
}

/** Build value → bitPosition map for one card. */
export function valueToBitMap(
  cells: readonly CardCellWithBit[]
): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cells) m.set(c.value, c.bitPosition);
  return m;
}
