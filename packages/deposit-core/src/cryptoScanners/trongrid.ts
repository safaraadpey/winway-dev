/**
 * TronGrid API scanner for TRX / TRC-20 USDT.
 *
 * Native TRX (TransferContract): eventIndex = 0 (no event log).
 * TRC-20 USDT: official `event_index` from GET /v1/transactions/{id}/events
 *   (TronGrid V1 — "The event's index within the transaction's event log.").
 * Account /transactions/trc20 is used only to discover candidate tx ids;
 * event identity always comes from the events API.
 *
 * TRC-10 (TransferAssetContract) is intentionally ignored.
 */
import bs58 from "bs58";
import { sha256 } from "@noble/hashes/sha2.js";
import { withExponentialBackoff } from "../cryptoRetry";
import { normalizeEventIndex } from "../cryptoDepositIdentity";
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
 * Tron base58check → 20-byte EVM-style hex (0x…), for matching TronGrid event `result.to`.
 */
export function tronBase58ToHexAddress(base58Addr: string): string | null {
  try {
    const decoded = bs58.decode(base58Addr);
    if (decoded.length < 25) return null;
    const payload = decoded.slice(0, decoded.length - 4);
    const checksum = decoded.slice(decoded.length - 4);
    const expected = sha256(sha256(payload)).slice(0, 4);
    if (
      checksum[0] !== expected[0] ||
      checksum[1] !== expected[1] ||
      checksum[2] !== expected[2] ||
      checksum[3] !== expected[3]
    ) {
      return null;
    }
    // Tron payload: 0x41 + 20-byte address
    if (payload[0] !== 0x41 || payload.length !== 21) return null;
    const hex = Buffer.from(payload.slice(1)).toString("hex");
    return `0x${hex}`.toLowerCase();
  } catch {
    return null;
  }
}

/** Normalize TronGrid event address fields (may be 20 or 32-byte hex). */
export function normalizeTronEventAddress(raw: unknown): string | null {
  const s = String(raw || "").toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(s)) return null;
  const trimmed = s.length >= 40 ? s.slice(-40) : s;
  if (trimmed.length !== 40) return null;
  return `0x${trimmed}`;
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
    eventIndex: 0,
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

type TronEventRow = {
  event_index?: number;
  event_name?: string;
  contract_address?: string;
  transaction_id?: string;
  block_timestamp?: number;
  result?: {
    from?: string;
    to?: string;
    value?: string;
  };
};

/**
 * Official TronGrid events for one transaction.
 * Docs: GET /v1/transactions/{transactionID}/events → data[].event_index
 */
export async function fetchTronTxEvents(
  txHash: string
): Promise<TronEventRow[]> {
  const body = await trongridGet(
    `/v1/transactions/${encodeURIComponent(txHash)}/events?only_confirmed=true`
  );
  return Array.isArray(body?.data) ? (body.data as TronEventRow[]) : [];
}

/**
 * TRC-20 USDT transfers with stable event_index from TronGrid events API.
 */
export async function scanTronTrc20(address: string): Promise<ObservedChainTx[]> {
  const body = await trongridGet(
    `/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?only_confirmed=true&limit=20&contract_address=${TRON_USDT_CONTRACT}`
  );
  const rows = Array.isArray(body?.data) ? body.data : [];
  const targetHex = tronBase58ToHexAddress(address);
  if (!targetHex) {
    console.error("[Payment] invalid TRON deposit address for event match", {
      address,
    });
    return [];
  }

  const txIdList: string[] = [];
  for (const tx of rows as Array<{ transaction_id?: string; txID?: string }>) {
    const id = String(tx.transaction_id || tx.txID || "");
    if (id) txIdList.push(id);
  }
  const txIds = [...new Set(txIdList)];

  const out: ObservedChainTx[] = [];

  for (const txHash of txIds) {
    let events: TronEventRow[];
    try {
      events = await fetchTronTxEvents(txHash);
    } catch (err) {
      console.error("[Payment] TronGrid events fetch failed — skip tx", {
        txHash,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    for (const ev of events) {
      if (String(ev.event_name || "") !== "Transfer") continue;
      const contract = String(ev.contract_address || "");
      if (contract && contract !== TRON_USDT_CONTRACT) continue;

      const toHex = normalizeTronEventAddress(ev.result?.to);
      if (!toHex || toHex !== targetHex) continue;

      const decimals = 6;
      const rawVal = Number(ev.result?.value ?? 0);
      if (!Number.isFinite(rawVal) || rawVal <= 0) continue;
      const amount = rawVal / 10 ** decimals;

      if (ev.event_index == null || !Number.isFinite(Number(ev.event_index))) {
        console.error("[Payment] TRC20 Transfer missing event_index — skip", {
          txHash,
        });
        continue;
      }

      out.push({
        network: "TRC20",
        currency: "USDT",
        txHash: String(ev.transaction_id || txHash),
        eventIndex: normalizeEventIndex(ev.event_index),
        fromAddress: String(ev.result?.from || ""),
        toAddress: address,
        cryptoAmount: amount,
        confirmations: 1,
        confirmed: true,
        blockTimestamp: ev.block_timestamp
          ? Math.floor(Number(ev.block_timestamp) / 1000)
          : undefined,
        raw: ev,
      });
    }
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
