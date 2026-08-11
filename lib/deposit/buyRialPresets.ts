/**
 * Buy Rial preset amounts — PostgreSQL source of truth for player amount picker.
 */
import type { Pool, PoolClient } from "pg";
import { DEFAULT_BUY_RIAL_PRESET_AMOUNTS_RIAL } from "./buyRialPresetDefaults";

export { DEFAULT_BUY_RIAL_PRESET_AMOUNTS_RIAL } from "./buyRialPresetDefaults";

type Queryable = Pool | PoolClient;

export type BuyRialPresetAmount = {
  id: string;
  amountRial: number;
  sortOrder: number;
  isActive: boolean;
};

export type UpsertBuyRialPresetInput = {
  id?: string;
  amountRial: number;
  sortOrder?: number;
  isActive?: boolean;
};

const MAX_AMOUNT_RIAL = 100_000_000_000;
const MAX_PRESETS = 50;

function mapRow(r: Record<string, unknown>): BuyRialPresetAmount {
  return {
    id: String(r.id),
    amountRial: Number(r.amount_rial),
    sortOrder: Number(r.sort_order ?? 0),
    isActive: r.is_active !== false,
  };
}

export async function listBuyRialPresetAmounts(
  db: Queryable,
  opts?: { activeOnly?: boolean }
): Promise<BuyRialPresetAmount[]> {
  const activeOnly = opts?.activeOnly === true;
  const { rows } = await db.query(
    `
    SELECT id, amount_rial, sort_order, is_active
    FROM deposit.buy_rial_preset_amounts
    ${activeOnly ? "WHERE is_active = true" : ""}
    ORDER BY sort_order ASC, amount_rial ASC
    `
  );
  return (rows as Record<string, unknown>[]).map(mapRow);
}

/** Active amounts for player UI; falls back to hardcoded defaults if empty. */
export async function getActiveBuyRialAmountsRial(
  db: Queryable
): Promise<number[]> {
  const rows = await listBuyRialPresetAmounts(db, { activeOnly: true });
  const amounts = rows
    .map((r) => r.amountRial)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (amounts.length === 0) {
    return [...DEFAULT_BUY_RIAL_PRESET_AMOUNTS_RIAL];
  }
  return amounts;
}

function assertValidPresets(presets: UpsertBuyRialPresetInput[]): void {
  if (!Array.isArray(presets) || presets.length === 0) {
    throw new Error("presets_required");
  }
  if (presets.length > MAX_PRESETS) {
    throw new Error("too_many_presets");
  }
  const seen = new Set<number>();
  for (const p of presets) {
    const amount = Number(p.amountRial);
    if (
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount <= 0 ||
      amount > MAX_AMOUNT_RIAL
    ) {
      throw new Error("invalid_amount");
    }
    if (seen.has(amount)) {
      throw new Error("duplicate_amount");
    }
    seen.add(amount);
  }
}

export async function replaceBuyRialPresetAmounts(
  db: Queryable,
  presets: UpsertBuyRialPresetInput[]
): Promise<BuyRialPresetAmount[]> {
  assertValidPresets(presets);

  const runInTx = async (q: Queryable) => {
    await q.query(`DELETE FROM deposit.buy_rial_preset_amounts`);
    for (let i = 0; i < presets.length; i++) {
      const p = presets[i]!;
      await q.query(
        `
        INSERT INTO deposit.buy_rial_preset_amounts (
          id, amount_rial, sort_order, is_active
        ) VALUES (
          COALESCE($1::uuid, gen_random_uuid()),
          $2, $3, $4
        )
        `,
        [
          p.id ?? null,
          Math.floor(Number(p.amountRial)),
          p.sortOrder ?? (i + 1) * 10,
          p.isActive !== false,
        ]
      );
    }
    return listBuyRialPresetAmounts(q, { activeOnly: false });
  };

  const pool = db as Pool;
  if (typeof pool.connect === "function") {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const result = await runInTx(c);
      await c.query("COMMIT");
      return result;
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    } finally {
      c.release();
    }
  }

  return runInTx(db);
}
