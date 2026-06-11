import type { CardDefinitionMasks, NumberIndexEntry } from "../bitmask/types.js";

/** Immutable global card registry loaded once and shared by all rooms. */
export interface GlobalCardRegistry {
  /** cardId → precomputed win masks */
  readonly definitions: ReadonlyMap<string, CardDefinitionMasks>;
  /** value (1–90) → affected global cards */
  readonly numberIndex: ReadonlyMap<number, readonly NumberIndexEntry[]>;
  /** cardId → value → bitPosition (for mask rebuild from marks) */
  readonly valueToBitByCard: ReadonlyMap<string, ReadonlyMap<number, number>>;
  readonly cardCount: number;
  readonly indexEntryCount: number;
}

export interface CardRegistryRow {
  pool_card_id: string;
  line1_mask: number;
  line2_mask: number;
  line3_mask: number;
  full_mask: number;
  cell_count: number;
}

export interface CardNumberIndexRow {
  value: number;
  pool_card_id: string;
  bit_position: number;
}
