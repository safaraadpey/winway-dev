/**
 * Etherscan API V2 scanner for BNB Smart Chain (chainid=56).
 *
 * Token transfers use official `logIndex` as event identity.
 * Native BNB transfers have no log → eventIndex = 0.
 */
import { withExponentialBackoff } from "../cryptoRetry";
import { normalizeEventIndex } from "../cryptoDepositIdentity";
import type { CryptoCurrency } from "../cryptoPriceLock";

/** Official Binance-Peg USDT on BSC */
export const BSC_USDT_CONTRACT =
  "0x55d398326f99059ff775485246999027b3197955";

export type ObservedChainTx = {
  network: "BEP20" | "TRC20";
  currency: CryptoCurrency;
  txHash: string;
  /** On-chain event identity within the transaction (TRON event_index / BEP20 logIndex). Native = 0. */
  eventIndex: number;
  fromAddress: string;
  toAddress: string;
  cryptoAmount: number;
  confirmations: number | null;
  confirmed: boolean;
  blockTimestamp?: number;
  raw?: unknown;
};

function etherscanKey(): string {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) throw new Error("ETHERSCAN_API_KEY_missing");
  return key;
}

async function etherscanGet(params: Record<string, string>): Promise<any> {
  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", "56");
  url.searchParams.set("apikey", etherscanKey());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  return withExponentialBackoff(
    async () => {
      const res = await fetch(url.toString(), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (res.status === 429) throw new Error("http_429");
      if (!res.ok) throw new Error(`http_${res.status}`);
      const body = await res.json();
      if (body?.status === "0" && String(body?.result || "").includes("rate")) {
        throw new Error("rate_limited");
      }
      return body;
    },
    { label: "etherscan-v2" }
  );
}

function toAmount(value: string, decimals: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / 10 ** decimals;
}

/**
 * Native BNB incoming transfers to address.
 * No Transfer log → eventIndex = 0 (one value transfer per native tx).
 */
export async function scanBscNativeTransfers(
  address: string
): Promise<ObservedChainTx[]> {
  const body = await etherscanGet({
    module: "account",
    action: "txlist",
    address,
    sort: "desc",
    page: "1",
    offset: "25",
  });

  const rows = Array.isArray(body?.result) ? body.result : [];
  const addr = address.toLowerCase();
  const out: ObservedChainTx[] = [];

  for (const tx of rows) {
    if (String(tx.to || "").toLowerCase() !== addr) continue;
    if (String(tx.isError) === "1") continue;
    const amount = toAmount(String(tx.value ?? "0"), 18);
    if (amount <= 0) continue;

    const confirmations = Number(tx.confirmations ?? 0);
    out.push({
      network: "BEP20",
      currency: "BNB",
      txHash: String(tx.hash),
      eventIndex: 0,
      fromAddress: String(tx.from || ""),
      toAddress: String(tx.to || ""),
      cryptoAmount: amount,
      confirmations: Number.isFinite(confirmations) ? confirmations : null,
      confirmed: false,
      blockTimestamp: Number(tx.timeStamp) || undefined,
      raw: tx,
    });
  }

  return out;
}

/**
 * BEP-20 token transfers (USDT filtered by contract).
 * Event identity: Etherscan `logIndex` (log position in the transaction/block log stream).
 */
export async function scanBscTokenTransfers(
  address: string
): Promise<ObservedChainTx[]> {
  const body = await etherscanGet({
    module: "account",
    action: "tokentx",
    address,
    sort: "desc",
    page: "1",
    offset: "40",
  });

  const rows = Array.isArray(body?.result) ? body.result : [];
  const addr = address.toLowerCase();
  const out: ObservedChainTx[] = [];

  for (const tx of rows) {
    if (String(tx.to || "").toLowerCase() !== addr) continue;
    const contract = String(tx.contractAddress || "").toLowerCase();
    if (contract !== BSC_USDT_CONTRACT) continue;

    const decimals = Number(tx.tokenDecimal ?? 18);
    const amount = toAmount(String(tx.value ?? "0"), decimals);
    if (amount <= 0) continue;

    const logIndexRaw = tx.logIndex ?? tx.logindex;
    if (logIndexRaw == null || logIndexRaw === "") {
      console.error("[Payment] BEP20 USDT transfer missing logIndex — skip", {
        txHash: tx.hash,
      });
      continue;
    }

    const confirmations = Number(tx.confirmations ?? 0);
    out.push({
      network: "BEP20",
      currency: "USDT",
      txHash: String(tx.hash),
      eventIndex: normalizeEventIndex(logIndexRaw),
      fromAddress: String(tx.from || ""),
      toAddress: String(tx.to || ""),
      cryptoAmount: amount,
      confirmations: Number.isFinite(confirmations) ? confirmations : null,
      confirmed: false,
      blockTimestamp: Number(tx.timeStamp) || undefined,
      raw: tx,
    });
  }

  return out;
}

export async function scanBep20Address(
  address: string
): Promise<ObservedChainTx[]> {
  const [native, tokens] = await Promise.all([
    scanBscNativeTransfers(address),
    scanBscTokenTransfers(address),
  ]);
  return [...native, ...tokens];
}
