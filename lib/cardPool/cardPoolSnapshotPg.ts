import { pgPool } from "@/lib/pg";
import type { CardPoolDefinition, CardPoolVersionMeta } from "@/lib/cardPool/types";

export type CardPoolMetaRow = {
  pool_id: string;
  commit_hash: string;
  prng_version: string;
  card_count: number;
};

export async function loadActiveCardPoolMetaFromPg(): Promise<CardPoolVersionMeta | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<CardPoolMetaRow>(
      `
      select
        id::text as pool_id,
        commit_hash,
        prng_version,
        card_count
      from public.card_pools
      where is_active = true
      limit 1
      `
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      poolId: row.pool_id,
      commitHash: row.commit_hash,
      prngVersion: row.prng_version,
      cardCount: Number(row.card_count ?? 0),
    };
  } catch (err) {
    console.error("[CardPoolCache] loadActiveCardPoolMetaFromPg error:", err);
    return null;
  }
}

export async function loadCardPoolMetaFromPg(poolId: string): Promise<CardPoolVersionMeta | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<CardPoolMetaRow>(
      `
      select
        id::text as pool_id,
        commit_hash,
        prng_version,
        card_count
      from public.card_pools
      where id = $1::uuid
      limit 1
      `,
      [poolId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      poolId: row.pool_id,
      commitHash: row.commit_hash,
      prngVersion: row.prng_version,
      cardCount: Number(row.card_count ?? 0),
    };
  } catch (err) {
    console.error("[CardPoolCache] loadCardPoolMetaFromPg error:", err);
    return null;
  }
}

function normalizeCardGrid(raw: unknown): (number | null)[][] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  if (Array.isArray(raw[0])) {
    const grid = raw as unknown[][];
    if (grid.length !== 3) return null;
    return grid.map((row) =>
      (Array.isArray(row) ? row : []).map((cell) =>
        cell == null || cell === "" ? null : Number(cell)
      )
    ) as (number | null)[][];
  }

  if (raw.length === 27 && typeof raw[0] !== "object") {
    const flat = raw as unknown[];
    const grid: (number | null)[][] = Array.from({ length: 3 }, () =>
      Array(9).fill(null)
    );
    for (let i = 0; i < 27; i++) {
      const row = Math.floor(i / 9);
      const col = i % 9;
      const cell = flat[i];
      grid[row]![col] = cell == null || cell === "" ? null : Number(cell);
    }
    return grid;
  }

  return null;
}

export async function loadCardPoolDefinitionsFromPg(
  poolId: string
): Promise<CardPoolDefinition[] | null> {
  if (!pgPool) return null;

  try {
    const cardsResult = await pgPool.query<{
      pool_card_id: string;
      card_no: number;
      card_data: unknown;
    }>(
      `
      select
        id::text as pool_card_id,
        card_no,
        card_data
      from public.card_pool_cards
      where pool_id = $1::uuid
      order by card_no asc
      `,
      [poolId]
    );

    if (cardsResult.rows.length > 0) {
      const definitions: CardPoolDefinition[] = [];
      for (const row of cardsResult.rows) {
        const grid = normalizeCardGrid(row.card_data);
        if (!grid) continue;
        definitions.push({
          poolCardId: row.pool_card_id,
          cardNo: row.card_no,
          card: grid,
        });
      }
      if (definitions.length > 0) {
        return definitions;
      }
    }

    const numbersResult = await pgPool.query<{
      pool_card_id: string;
      card_no: number;
      row_no: number;
      col_no: number;
      value: number | null;
    }>(
      `
      select
        cpc.id::text as pool_card_id,
        cpc.card_no,
        cn.row_no,
        cn.col_no,
        cn.value
      from public.card_pool_cards cpc
      join public.card_numbers cn on cn.pool_card_id = cpc.id
      where cpc.pool_id = $1::uuid
      order by cpc.card_no asc, cn.row_no asc, cn.col_no asc
      `,
      [poolId]
    );

    const byPoolCardId = new Map<string, CardPoolDefinition>();
    for (const row of numbersResult.rows) {
      let entry = byPoolCardId.get(row.pool_card_id);
      if (!entry) {
        entry = {
          poolCardId: row.pool_card_id,
          cardNo: row.card_no,
          card: Array.from({ length: 3 }, () => Array(9).fill(null) as Array<number | null>),
        };
        byPoolCardId.set(row.pool_card_id, entry);
      }
      const rowIndex = row.row_no - 1;
      const colIndex = row.col_no - 1;
      if (rowIndex >= 0 && rowIndex < 3 && colIndex >= 0 && colIndex < 9) {
        entry.card[rowIndex]![colIndex] = row.value;
      }
    }

    return [...byPoolCardId.values()].sort((a, b) => a.cardNo - b.cardNo);
  } catch (err) {
    console.error("[CardPoolCache] loadCardPoolDefinitionsFromPg error:", err);
    return null;
  }
}

export async function loadCardPoolMetaForRoomFromPg(
  roomId: string
): Promise<CardPoolVersionMeta | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<CardPoolMetaRow>(
      `
      select
        cp.id::text as pool_id,
        cp.commit_hash,
        cp.prng_version,
        cp.card_count
      from public.rooms r
      join public.card_pools cp on cp.id = r.pool_id
      where r.id = $1::uuid
      limit 1
      `,
      [roomId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      poolId: row.pool_id,
      commitHash: row.commit_hash,
      prngVersion: row.prng_version,
      cardCount: Number(row.card_count ?? 0),
    };
  } catch (err) {
    console.error("[CardPoolCache] loadCardPoolMetaForRoomFromPg error:", err);
    return null;
  }
}
