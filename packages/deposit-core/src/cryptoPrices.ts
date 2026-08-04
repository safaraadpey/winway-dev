/**
 * Live reference prices for crypto deposit invoices.
 * - USDT→Toman: Tetherland
 * - TRX→USD: CoinGecko
 */
export type CryptoReferencePrices = {
  usdtTomanPrice: number;
  trxUsdPrice: number;
  fetchedAt: string;
  sources: {
    usdtToman: "tetherland";
    trxUsd: "coingecko";
  };
};

type CacheEntry = {
  prices: CryptoReferencePrices;
  expiresAt: number;
};

const CACHE_TTL_MS = 30_000;
let cache: CacheEntry | null = null;

const TETHERLAND_URL = "https://api.tetherland.com/currencies";
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd";

async function fetchJson(url: string, timeoutMs = 12_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`http_${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchUsdtTomanPrice(): Promise<number> {
  const body = (await fetchJson(TETHERLAND_URL)) as {
    data?: { currencies?: { USDT?: { price?: number | string } } };
  };
  const raw = body?.data?.currencies?.USDT?.price;
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("invalid_usdt_toman_price");
  }
  return price;
}

export async function fetchTrxUsdPrice(): Promise<number> {
  const body = (await fetchJson(COINGECKO_URL)) as {
    tron?: { usd?: number | string };
  };
  const price = Number(body?.tron?.usd);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("invalid_trx_usd_price");
  }
  return price;
}

/**
 * Fetch both live prices in parallel. Short in-memory cache to protect upstream APIs.
 */
export async function getCryptoReferencePrices(opts?: {
  force?: boolean;
}): Promise<CryptoReferencePrices> {
  const now = Date.now();
  if (!opts?.force && cache && cache.expiresAt > now) {
    return cache.prices;
  }

  console.log("[Payment] fetching live crypto reference prices");

  const [usdtTomanPrice, trxUsdPrice] = await Promise.all([
    fetchUsdtTomanPrice(),
    fetchTrxUsdPrice(),
  ]);

  const prices: CryptoReferencePrices = {
    usdtTomanPrice,
    trxUsdPrice,
    fetchedAt: new Date().toISOString(),
    sources: { usdtToman: "tetherland", trxUsd: "coingecko" },
  };

  cache = { prices, expiresAt: now + CACHE_TTL_MS };
  console.log("[Payment] crypto reference prices ready", {
    usdtTomanPrice,
    trxUsdPrice,
  });
  return prices;
}
