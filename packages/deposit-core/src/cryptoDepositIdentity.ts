/**
 * Crypto deposit event identity + wallet idempotency key helpers.
 *
 * Deposit uniqueness: (network, tx_hash, event_index)
 * Credit idempotency: deposit:crypto:{network}:{txHash}:{eventIndex}
 */
export function normalizeEventIndex(raw: unknown, fallback = 0): number {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  const s = String(raw).trim();
  if (!s) return fallback;
  const n = s.startsWith("0x") || s.startsWith("0X") ? Number.parseInt(s, 16) : Number(s);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export function cryptoDepositIdempotencyKey(opts: {
  network: string;
  txHash: string;
  eventIndex: number;
}): string {
  const network = String(opts.network || "").trim();
  const txHash = String(opts.txHash || "").trim();
  const eventIndex = normalizeEventIndex(opts.eventIndex, 0);
  return `deposit:crypto:${network}:${txHash}:${eventIndex}`;
}
