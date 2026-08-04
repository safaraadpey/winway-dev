/**
 * Crypto deposit invoice engine — tier multipliers + quote calculation.
 */
import type { Pool, PoolClient } from "pg";
import {
  getCryptoReferencePrices,
  type CryptoReferencePrices,
} from "./cryptoPrices";

export type CryptoNetwork = "BEP20" | "TRC20" | "TRX";

export type CryptoRateTier = {
  id: string;
  network: CryptoNetwork;
  minUsd: number;
  maxUsd: number;
  multiplier: number;
  bonusPercent: number;
  sortOrder: number;
  isActive: boolean;
};

export type InvoiceBadge = {
  type: "best_bonus" | "bonus";
  text: string;
  tone: "green" | "orange" | "teal";
};

export type InvoiceNetworkOption = {
  network: CryptoNetwork;
  label: string;
  multiplier: number;
  bonusPercent: number;
  finalToman: number;
  requiredCryptoAmount: number;
  cryptoSymbol: "USDT" | "TRX";
  /** Highest credit for the player (best network offer). */
  isBestOffer: boolean;
  badges: InvoiceBadge[];
  tier: {
    minUsd: number;
    maxUsd: number;
  };
};

export type CryptoInvoiceQuote = {
  usdAmount: number;
  rates: CryptoReferencePrices;
  baseToman: number;
  options: InvoiceNetworkOption[];
};

type Queryable = Pool | PoolClient;

const NETWORK_LABELS: Record<CryptoNetwork, string> = {
  BEP20: "BEP-20 (BNB Smart Chain)",
  TRC20: "TRC-20 (Tron USDT)",
  TRX: "TRX (Native Tron)",
};

const NETWORKS: CryptoNetwork[] = ["BEP20", "TRC20", "TRX"];

function rowToTier(r: Record<string, unknown>): CryptoRateTier {
  return {
    id: String(r.id),
    network: String(r.network) as CryptoNetwork,
    minUsd: Number(r.min_usd),
    maxUsd: Number(r.max_usd),
    multiplier: Number(r.multiplier),
    bonusPercent: Number(r.bonus_percent ?? 0),
    sortOrder: Number(r.sort_order ?? 0),
    isActive: Boolean(r.is_active),
  };
}

export async function listCryptoRateTiers(
  db: Queryable,
  opts?: { activeOnly?: boolean }
): Promise<CryptoRateTier[]> {
  const activeOnly = opts?.activeOnly ?? false;
  const { rows } = await db.query(
    `
    SELECT id, network, min_usd, max_usd, multiplier, bonus_percent,
           sort_order, is_active
    FROM deposit.crypto_rate_tiers
    WHERE ($1::boolean = false OR is_active = true)
    ORDER BY sort_order ASC, network ASC, min_usd ASC
    `,
    [activeOnly]
  );
  return (rows as Record<string, unknown>[]).map(rowToTier);
}

/**
 * Pick the most specific active tier for network + usd amount.
 * Match: minUsd <= amount <= maxUsd (inclusive); prefer highest minUsd on overlap.
 */
export function getTierMultiplier(
  tiers: CryptoRateTier[],
  network: CryptoNetwork,
  usdAmount: number
): CryptoRateTier {
  if (!Number.isFinite(usdAmount) || usdAmount < 0) {
    throw new Error(`no_tier_for_${network}`);
  }

  const forNetwork = tiers.filter((t) => t.network === network && t.isActive);
  if (forNetwork.length === 0) {
    throw new Error(`no_tier_for_${network}`);
  }

  const matches = forNetwork
    .filter((t) => usdAmount >= t.minUsd && usdAmount <= t.maxUsd)
    .sort((a, b) => b.minUsd - a.minUsd);

  const tier = matches[0];
  if (!tier) {
    // Keep no_tier_for_* prefix (API maps it); include range hint for ops logs.
    const minBound = Math.min(...forNetwork.map((t) => t.minUsd));
    const maxBound = Math.max(...forNetwork.map((t) => t.maxUsd));
    throw new Error(
      `no_tier_for_${network}:usd_out_of_range:${usdAmount}:allowed:${minBound}-${maxBound}`
    );
  }
  return tier;
}

function roundCryptoAmount(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export async function calculateCryptoInvoice(
  db: Queryable,
  usdAmount: number
): Promise<CryptoInvoiceQuote> {
  if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
    throw new Error("invalid_usd_amount");
  }

  const [rates, tiers] = await Promise.all([
    getCryptoReferencePrices(),
    listCryptoRateTiers(db, { activeOnly: true }),
  ]);

  const baseToman = usdAmount * rates.usdtTomanPrice;
  console.log("[Payment] calculate invoice", {
    usdAmount,
    baseToman,
    usdtTomanPrice: rates.usdtTomanPrice,
    trxUsdPrice: rates.trxUsdPrice,
  });

  const options: InvoiceNetworkOption[] = NETWORKS.map((network) => {
    const tier = getTierMultiplier(tiers, network, usdAmount);
    let finalToman: number;
    let requiredCryptoAmount: number;
    let cryptoSymbol: "USDT" | "TRX";

    if (network === "TRX") {
      const requiredTrx = usdAmount / rates.trxUsdPrice;
      finalToman = Math.ceil(
        requiredTrx * rates.trxUsdPrice * rates.usdtTomanPrice * tier.multiplier
      );
      requiredCryptoAmount = roundCryptoAmount(requiredTrx, 4);
      cryptoSymbol = "TRX";
    } else {
      finalToman = Math.ceil(baseToman * tier.multiplier);
      requiredCryptoAmount = roundCryptoAmount(usdAmount, 6);
      cryptoSymbol = "USDT";
    }

    const badges: InvoiceBadge[] = [];
    if (tier.bonusPercent > 0) {
      badges.push({
        type: "bonus",
        text: `بونوس ${tier.bonusPercent}%`,
        tone: "teal",
      });
    }

    return {
      network,
      label: NETWORK_LABELS[network],
      multiplier: tier.multiplier,
      bonusPercent: tier.bonusPercent,
      finalToman,
      requiredCryptoAmount,
      cryptoSymbol,
      isBestOffer: false,
      badges,
      tier: { minUsd: tier.minUsd, maxUsd: tier.maxUsd },
    };
  });

  // Player receives toman credit — highest finalToman is the best offer.
  const maxToman = Math.max(...options.map((o) => o.finalToman));
  for (const opt of options) {
    if (opt.finalToman === maxToman) {
      opt.isBestOffer = true;
      const hasBest = opt.badges.some((b) => b.type === "best_bonus");
      if (!hasBest) {
        opt.badges.unshift({
          type: "best_bonus",
          text: "بونوس ویژه",
          tone: "green",
        });
      }
    }
  }

  return {
    usdAmount,
    rates,
    baseToman: Math.ceil(baseToman),
    options,
  };
}

export type UpsertTierInput = {
  id?: string;
  network: CryptoNetwork;
  minUsd: number;
  maxUsd: number;
  multiplier: number;
  bonusPercent?: number;
  sortOrder?: number;
  isActive?: boolean;
};

export async function replaceCryptoRateTiers(
  db: Queryable,
  tiers: UpsertTierInput[]
): Promise<CryptoRateTier[]> {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error("tiers_required");
  }

  for (const t of tiers) {
    if (!NETWORKS.includes(t.network)) throw new Error("invalid_network");
    if (!(t.minUsd >= 0) || !(t.maxUsd > t.minUsd)) {
      throw new Error("invalid_range");
    }
    if (!(t.multiplier > 0) || t.multiplier > 10) {
      throw new Error("invalid_multiplier");
    }
    const bonus = Number(t.bonusPercent ?? 0);
    if (!(bonus >= 0) || bonus > 100) throw new Error("invalid_bonus");
  }

  const runInTx = async (q: Queryable) => {
    await q.query(`DELETE FROM deposit.crypto_rate_tiers`);
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i]!;
      await q.query(
        `
        INSERT INTO deposit.crypto_rate_tiers (
          id, network, min_usd, max_usd, multiplier, bonus_percent, sort_order, is_active
        ) VALUES (
          COALESCE($1::uuid, gen_random_uuid()),
          $2, $3, $4, $5, $6, $7, $8
        )
        `,
        [
          t.id ?? null,
          t.network,
          t.minUsd,
          t.maxUsd,
          t.multiplier,
          Number(t.bonusPercent ?? 0),
          t.sortOrder ?? (i + 1) * 10,
          t.isActive !== false,
        ]
      );
    }
    return listCryptoRateTiers(q, { activeOnly: false });
  };

  const pool = db as Pool;
  if (typeof pool.connect === "function") {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const result = await runInTx(c);
      await c.query("COMMIT");
      console.log("[Payment] admin crypto rate tiers replaced", {
        count: result.length,
      });
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }

  return runInTx(db);
}
