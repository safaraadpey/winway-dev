/**
 * TronGrid API scanner for TRX / TRC-20 USDT.
 *
 * Native TRX (TransferContract) is supported.
 * TRC-10 (TransferAssetContract) is intentionally ignored — raw units must not
 * be priced as TRX (that produced no_tier_for_TRX on large asset amounts).
 */
import { withExponentialBackoff } from "../cryptoRetry";
import type { ObservedChainTx } from "./etherscan";

/** Official USDT TRC-20 */
export const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function trongridHeaders(): HeadersInit {
  const key = process.env.TRONGRID_API_KEY;
  const headers: HeadersInit = { Accept: "application/json" };
  if (key) headers["TRON-PRO-API-KEY"] = key;
  return headers;
}

async function trongridGet(path: string): Promise<any> {
  return withExponentialBackoff(
    async () => {
      const res = await fetch(`https://api.trongrid.io${path}`, {
        cache: "no-store",
        headers: trongridHeaders(),
      });
      if (res.status === 429) throw new Error("http_429");
      if (!res.ok) throw new Error(`http_${res.status}`);
      return res.json();
    },
    { label: "trongrid" }
  );
}

/** Convert sun (1e-6 TRX) → TRX. Returns 0 for non-positive / non-finite. */
export function sunToTrx(sun: string | number): number {
  const n = Number(sun);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / 1_000_000;
}

/**
 * Parse one TronGrid account transaction into a deposit observation.
 * Returns null for unsupported contract types (e.g. TRC-10 assets).
 */
export function observeTronNativeTransfer(
  tx: any,
  address: string
): ObservedChainTx | null {
  const ret = tx?.ret?.[0]?.contractRet;
  const confirmed = Boolean(tx?.confirmed ?? true) && ret === "SUCCESS";
  if (!confirmed && ret && ret !== "SUCCESS") return null;

  const contract = tx?.raw_data?.contract?.[0];
  const type = contract?.type;
  const value = contract?.parameter?.value;

  if (type === "TransferAssetContract") {
    // Unsupported TRC-10 — do not observe (avoids raw-unit × TRX price blowups).
    return null;
  }

  if (type !== "TransferContract") return null;

  const amount = sunToTrx(value?.amount ?? 0);
  if (amount <= 0) return null;

  const txHash = String(tx.txID || tx.transaction_id || "");
  if (!txHash) return null;

  return {
    network: "TRC20",
    currency: "TRX",
    txHash,
    fromAddress: String(value?.owner_address || ""),
    toAddress: address,
    cryptoAmount: amount,
    confirmations: confirmed ? 1 : 0,
    confirmed,
    blockTimestamp: tx.block_timestamp
      ? Math.floor(Number(tx.block_timestamp) / 1000)
      : undefined,
    raw: tx,
  };
}

/**
 * TRX native incoming transfers only (TransferContract).
 */
export async function scanTronNativeAndTrc10(
  address: string
): Promise<ObservedChainTx[]> {
  const body = await trongridGet(
    `/v1/accounts/${encodeURIComponent(address)}/transactions?only_confirmed=true&limit=20&only_to=true`
  );
  const rows = Array.isArray(body?.data) ? body.data : [];
  const out: ObservedChainTx[] = [];
  let skippedTrc10 = 0;

  for (const tx of rows) {
    const contractType = tx?.raw_data?.contract?.[0]?.type;
    if (contractType === "TransferAssetContract") {
      skippedTrc10 += 1;
      continue;
    }
    const obs = observeTronNativeTransfer(tx, address);
    if (obs) out.push(obs);
  }

  if (skippedTrc10 > 0) {
    console.log("[Payment] skipped unsupported TRC-10 transfers", {
      address,
      skippedTrc10,
    });
  }

  return out;
}

/**
 * TRC-20 token transfers (USDT).
 */
export async function scanTronTrc20(address: string): Promise<ObservedChainTx[]> {
  const body = await trongridGet(
    `/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?only_confirmed=true&limit=20&contract_address=${TRON_USDT_CONTRACT}`
  );
  const rows = Array.isArray(body?.data) ? body.data : [];
  const out: ObservedChainTx[] = [];

  for (const tx of rows) {
    if (String(tx.to || "") !== address) continue;
    const tokenAddr = String(tx.token_info?.address || tx.contract_address || "");
    if (tokenAddr && tokenAddr !== TRON_USDT_CONTRACT) continue;

    const decimals = Number(tx.token_info?.decimals ?? 6);
    const rawVal = Number(tx.value ?? 0);
    if (!Number.isFinite(rawVal) || rawVal <= 0) continue;
    const amount = rawVal / 10 ** decimals;

    const confirmed = true; // only_confirmed=true
    out.push({
      network: "TRC20",
      currency: "USDT",
      txHash: String(tx.transaction_id || tx.txID || ""),
      fromAddress: String(tx.from || ""),
      toAddress: String(tx.to || address),
      cryptoAmount: amount,
      confirmations: 1,
      confirmed,
      blockTimestamp: tx.block_timestamp
        ? Math.floor(Number(tx.block_timestamp) / 1000)
        : undefined,
      raw: tx,
    });
  }

  return out.filter((t) => t.txHash);
}

export async function scanTrc20Address(
  address: string
): Promise<ObservedChainTx[]> {
  const [native, trc20] = await Promise.all([
    scanTronNativeAndTrc10(address),
    scanTronTrc20(address),
  ]);
  return [...native, ...trc20];
}
