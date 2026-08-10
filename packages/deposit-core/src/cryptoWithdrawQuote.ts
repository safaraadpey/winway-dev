/**
 * Crypto withdrawal quote — toman request is exact; crypto payable is truncated to 2 decimals.
 * Uses spot Tetherland/CoinGecko rates (no deposit tier multipliers).
 */
import {
  getCryptoReferencePrices,
  type CryptoReferencePrices,
} from "./cryptoPrices";
import type { CryptoNetwork } from "./cryptoInvoice";

export const CRYPTO_WITHDRAW_NETWORKS: CryptoNetwork[] = ["TRC20", "BEP20", "TRX"];
export const MIN_CRYPTO_WITHDRAWAL_AMOUNT = 0.01;
export const CRYPTO_WITHDRAW_QUOTE_MAX_AGE_MS = 5 * 60 * 1000;

/** @deprecated use MIN_CRYPTO_WITHDRAWAL_AMOUNT */
export const MIN_CRYPTO_WITHDRAWAL_USDT = MIN_CRYPTO_WITHDRAWAL_AMOUNT;

export type CryptoWithdrawQuote = {
  network: CryptoNetwork;
  cryptoSymbol: "USDT" | "TRX";
  cryptoAmount: number;
  lockedToman: number;
  requestedToman: number;
  rates: CryptoReferencePrices;
  quotedAt: string;
};

/** Truncate (floor) crypto amount to fixed decimal places — never round up. */
export function truncateCryptoAmount(n: number, digits = 2): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const factor = 10 ** digits;
  return Math.floor(n * factor + 1e-9) / factor;
}

export function calculateCryptoWithdrawQuote(params: {
  tomanAmount: number;
  network: CryptoNetwork;
  rates: CryptoReferencePrices;
  quotedAt?: string;
}): CryptoWithdrawQuote {
  const { tomanAmount, network, rates } = params;
  const quotedAt = params.quotedAt ?? new Date().toISOString();

  if (!Number.isFinite(tomanAmount) || tomanAmount <= 0 || !Number.isInteger(tomanAmount)) {
    throw new Error("invalid_toman_amount");
  }

  const usdtTomanPrice = rates.usdtTomanPrice;
  const trxUsdPrice = rates.trxUsdPrice;

  if (!Number.isFinite(usdtTomanPrice) || usdtTomanPrice <= 0) {
    throw new Error("price_feed_unavailable");
  }

  let cryptoAmount: number;
  let cryptoSymbol: "USDT" | "TRX";
  const lockedToman = tomanAmount;

  if (network === "TRX") {
    if (!Number.isFinite(trxUsdPrice) || trxUsdPrice <= 0) {
      throw new Error("price_feed_unavailable");
    }
    const rawTrx = tomanAmount / (usdtTomanPrice * trxUsdPrice);
    cryptoAmount = truncateCryptoAmount(rawTrx, 2);
    cryptoSymbol = "TRX";
  } else if (network === "BEP20" || network === "TRC20") {
    const rawUsdt = tomanAmount / usdtTomanPrice;
    cryptoAmount = truncateCryptoAmount(rawUsdt, 2);
    cryptoSymbol = "USDT";
  } else {
    throw new Error("invalid_network");
  }

  if (cryptoAmount < MIN_CRYPTO_WITHDRAWAL_AMOUNT) {
    throw new Error("amount_too_small");
  }

  console.log("[Withdrawal] crypto quote calculated", {
    network,
    requestedToman: tomanAmount,
    cryptoAmount,
    cryptoSymbol,
    lockedToman,
    usdtTomanPrice,
    trxUsdPrice,
  });

  return {
    network,
    cryptoSymbol,
    cryptoAmount,
    lockedToman,
    requestedToman: tomanAmount,
    rates,
    quotedAt,
  };
}

export function calculateAllCryptoWithdrawQuotes(params: {
  tomanAmount: number;
  rates: CryptoReferencePrices;
  quotedAt?: string;
}): Record<CryptoNetwork, CryptoWithdrawQuote> {
  const quotedAt = params.quotedAt ?? new Date().toISOString();
  const quotes = {} as Record<CryptoNetwork, CryptoWithdrawQuote>;

  for (const network of CRYPTO_WITHDRAW_NETWORKS) {
    quotes[network] = calculateCryptoWithdrawQuote({
      tomanAmount: params.tomanAmount,
      network,
      rates: params.rates,
      quotedAt,
    });
  }

  return quotes;
}

export async function fetchCryptoWithdrawQuote(
  tomanAmount: number,
  network: CryptoNetwork
): Promise<CryptoWithdrawQuote> {
  const rates = await getCryptoReferencePrices();
  return calculateCryptoWithdrawQuote({ tomanAmount, network, rates });
}

export function isCryptoWithdrawQuoteFresh(
  quotedAt: string,
  maxAgeMs: number = CRYPTO_WITHDRAW_QUOTE_MAX_AGE_MS
): boolean {
  const ts = Date.parse(quotedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= maxAgeMs;
}

export function validateCryptoWalletAddress(
  network: CryptoNetwork,
  address: string
): boolean {
  const trimmed = String(address || "").trim();
  if (!trimmed) return false;

  if (network === "BEP20") {
    return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  }

  if (network === "TRC20" || network === "TRX") {
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed);
  }

  return false;
}
