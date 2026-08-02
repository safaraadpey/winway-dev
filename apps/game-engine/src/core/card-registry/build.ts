import { computeCardDefinitionMasks } from "../bitmask/masks.js";
import { assignBitPositions, valueToBitMap } from "../bitmask/layout.js";
import type { CardDefinitionMasks, NumberIndexEntry } from "../bitmask/types.js";
import type { GlobalCardRegistry } from "./types.js";

export interface RawCardNumber {
  pool_card_id: string;
  value: number;
  row_no: number;
  col_no: number;
}

/** Build registry entirely in memory from card_numbers rows (fallback / tests). */
export function buildRegistryFromCardNumbers(
  rows: readonly RawCardNumber[]
): GlobalCardRegistry {
  const byCard = new Map<string, RawCardNumber[]>();
  for (const r of rows) {
    const id = String(r.pool_card_id);
    if (!byCard.has(id)) byCard.set(id, []);
    byCard.get(id)!.push(r);
  }

  const definitions = new Map<string, CardDefinitionMasks>();
  const valueToBitByCard = new Map<string, Map<number, number>>();
  const numberIndex = new Map<number, NumberIndexEntry[]>();

  for (const [cardId, cells] of byCard) {
    const layoutCells = cells.map((c) => ({
      value: c.value,
      rowNo: c.row_no,
      colNo: c.col_no,
    }));
    const def = computeCardDefinitionMasks(cardId, layoutCells);
    definitions.set(cardId, def);

    const positioned = assignBitPositions(layoutCells);
    valueToBitByCard.set(cardId, valueToBitMap(positioned));

    for (const c of positioned) {
      if (!numberIndex.has(c.value)) numberIndex.set(c.value, []);
      numberIndex.get(c.value)!.push({ cardId, bitPosition: c.bitPosition });
    }
  }

  let indexEntryCount = 0;
  for (const entries of numberIndex.values()) indexEntryCount += entries.length;

  return {
    definitions,
    numberIndex,
    valueToBitByCard,
    cardCount: definitions.size,
    indexEntryCount,
  };
}

/** Build registry from precomputed DB tables (card_definition_masks + card_number_index). */
export function buildRegistryFromDbRows(
  maskRows: readonly {
    pool_card_id: string;
    line1_mask: number;
    line2_mask: number;
    line3_mask: number;
    full_mask: number;
    cell_count: number;
  }[],
  indexRows: readonly {
    value: number;
    pool_card_id: string;
    bit_position: number;
  }[]
): GlobalCardRegistry {
  const definitions = new Map<string, CardDefinitionMasks>();
  for (const r of maskRows) {
    const cardId = String(r.pool_card_id);
    definitions.set(cardId, {
      cardId,
      line1Mask: r.line1_mask,
      line2Mask: r.line2_mask,
      line3Mask: r.line3_mask,
      fullMask: r.full_mask,
      cellCount: r.cell_count,
    });
  }

  const numberIndex = new Map<number, NumberIndexEntry[]>();
  const valueToBitByCard = new Map<string, Map<number, number>>();

  for (const r of indexRows) {
    const cardId = String(r.pool_card_id);
    const value = Number(r.value);
    const bitPosition = Number(r.bit_position);
    if (!Number.isFinite(value) || !Number.isFinite(bitPosition)) continue;

    if (!numberIndex.has(value)) numberIndex.set(value, []);
    numberIndex.get(value)!.push({
      cardId,
      bitPosition,
    });

    if (!valueToBitByCard.has(cardId)) valueToBitByCard.set(cardId, new Map());
    valueToBitByCard.get(cardId)!.set(value, bitPosition);
  }

  let indexEntryCount = 0;
  for (const entries of numberIndex.values()) indexEntryCount += entries.length;

  return {
    definitions,
    numberIndex,
    valueToBitByCard,
    cardCount: definitions.size,
    indexEntryCount,
  };
}
