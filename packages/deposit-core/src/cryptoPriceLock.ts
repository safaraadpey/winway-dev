/**
 * Price lock + toman conversion for observed crypto deposits.
 */
import type { Pool } from "pg";
import {
  getCryptoReferencePrices,
  type CryptoReferencePrices,
} from "./cryptoPrices";
import {
  getTierMultiplier,
  listCryptoRateTiers,
  type CryptoNetwork,
  type CryptoRateTier,
} from "./cryptoInvoice";
import {
  CRYPTO_REDIS_KEYS,
  CRYPTO_TTL,
  getCryptoRedis,
} from "./cryptoRedis";
import { withExponentialBackoff } from "./cryptoRetry";

export type LockedRates = CryptoReferencePrices & {
  bnbUsdPrice: number;
};

export type PriceLockPayload = {
  userId: string;
  lockedAt: string;
  expiresAt: string;
  rates: LockedRates;
  tiers: Array<{
    network: CryptoNetwork;
    minUsd: number;
    maxUsd: number;
    multiplier: number;
    bonusPercent: number;
    isActive: boolean;
  }>;
};

const COINGECKO_BNB =
  "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd";

async function fetchBnbUsdPrice(): Promise<number> {
  return withExponentialBackoff(
    async () => {
      const res = await fetch(COINGECKO_BNB, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const body = (await res.json()) as {
        binancecoin?: { usd?: number };
      };
      const price = Number(body?.binancecoin?.usd);
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error("invalid_bnb_usd_price");
      }
      return price;
    },
    { label: "coingecko-bnb" }
  );
}

export async function getLockedRates(force = false): Promise<LockedRates> {
  const [base, bnbUsdPrice] = await Promise.all([
    getCryptoReferencePrices({ force }),
    fetchBnbUsdPrice(),
  ]);
  return { ...base, bnbUsdPrice };
}

export async function createAndStorePriceLock(
  db: Pool,
  userId: string
): Promise<PriceLockPayload> {
  const redis = getCryptoRedis();
  const [rates, tiers] = await Promise.all([
    getLockedRates(true),
    listCryptoRateTiers(db, { activeOnly: true }),
  ]);

  const lockedAt = new Date();
  const expiresAt = new Date(
    lockedAt.getTime() + CRYPTO_TTL.PRICE_LOCK_SEC * 1000
  );

  const payload: PriceLockPayload = {
    userId,
    lockedAt: lockedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    rates,
    tiers: tiers.map((t) => ({
      network: t.network,
      minUsd: t.minUsd,
      maxUsd: t.maxUsd,
      multiplier: t.multiplier,
      bonusPercent: t.bonusPercent,
      isActive: t.isActive,
    })),
  };

  await redis.setJson(
    CRYPTO_REDIS_KEYS.priceLock(userId),
    payload,
    CRYPTO_TTL.PRICE_LOCK_SEC
  );

  console.log("[Payment] price lock stored", {
    userId,
    expiresAt: payload.expiresAt,
    backend: redis.backend,
  });

  return payload;
}

export async function getPriceLock(
  userId: string
): Promise<PriceLockPayload | null> {
  const redis = getCryptoRedis();
  return redis.getJson<PriceLockPayload>(CRYPTO_REDIS_KEYS.priceLock(userId));
}

export type CryptoCurrency = "USDT" | "BNB" | "TRX" | "TRC10";

/** Currencies we will quote and credit. TRC-10 tokens are observed but unsupported. */
export const SUPPORTED_DEPOSIT_CURRENCIES = ["USDT", "BNB", "TRX"] as const;

export type SupportedDepositCurrency =
  (typeof SUPPORTED_DEPOSIT_CURRENCIES)[number];

export function isSupportedDepositCurrency(
  currency: string
): currency is SupportedDepositCurrency {
  return (SUPPORTED_DEPOSIT_CURRENCIES as readonly string[]).includes(currency);
}

export function cryptoAmountToUsd(
  currency: CryptoCurrency,
  amount: number,
  rates: LockedRates
): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("invalid_crypto_amount");
  }
  if (currency === "USDT") return amount;
  if (currency === "BNB") return amount * rates.bnbUsdPrice;
  if (currency === "TRX") return amount * rates.trxUsdPrice;
  // TRC-10 raw units must never be priced as native TRX (was causing no_tier_for_TRX).
  throw new Error(`unsupported_currency:${currency}`);
}

/**
 * Map observed chain network + currency → pricing tier network.
 * Native TRX uses the TRX tier; TRC-20 USDT uses TRC20; BEP20 uses BEP20.
 */
export function tierNetworkForDeposit(
  network: "BEP20" | "TRC20",
  currency: CryptoCurrency
): CryptoNetwork {
  if (!isSupportedDepositCurrency(currency)) {
    throw new Error(`unsupported_currency:${currency}`);
  }
  if (network === "BEP20") return "BEP20";
  if (currency === "TRX") return "TRX";
  return "TRC20";
}

function tiersFromLock(lock: PriceLockPayload): CryptoRateTier[] {
  return lock.tiers.map((t, i) => ({
    id: `lock-${i}`,
    network: t.network,
    minUsd: t.minUsd,
    maxUsd: t.maxUsd,
    multiplier: t.multiplier,
    bonusPercent: t.bonusPercent,
    sortOrder: i,
    isActive: t.isActive,
  }));
}

export type TomanQuoteResult = {
  tomanAmount: number;
  usdAmount: number;
  multiplier: number;
  bonusPercent: number;
  priceSource: "price_lock" | "live";
  rates: LockedRates;
};

/**
 * Convert observed crypto deposit to toman using lock (if valid) or live rates.
 */
export async function quoteDepositToman(opts: {
  db: Pool;
  userId: string;
  network: "BEP20" | "TRC20";
  currency: CryptoCurrency;
  cryptoAmount: number;
  preferLock: boolean;
}): Promise<TomanQuoteResult> {
  const lock = opts.preferLock ? await getPriceLock(opts.userId) : null;
  const useLock = Boolean(lock);

  const rates = useLock ? lock!.rates : await getLockedRates(false);
  const tiers = useLock
    ? tiersFromLock(lock!)
    : await listCryptoRateTiers(opts.db, { activeOnly: true });

  const usdAmount = cryptoAmountToUsd(opts.currency, opts.cryptoAmount, rates);
  const tierNetwork = tierNetworkForDeposit(opts.network, opts.currency);
  const tier = getTierMultiplier(tiers, tierNetwork, usdAmount);

  const baseToman = usdAmount * rates.usdtTomanPrice;
  const withMultiplier = baseToman * tier.multiplier;
  const withBonus =
    tier.bonusPercent > 0
      ? withMultiplier * (1 + tier.bonusPercent / 100)
      : withMultiplier;

  return {
    tomanAmount: Math.ceil(withBonus),
    usdAmount,
    multiplier: tier.multiplier,
    bonusPercent: tier.bonusPercent,
    priceSource: useLock ? "price_lock" : "live",
    rates,
  };
}
