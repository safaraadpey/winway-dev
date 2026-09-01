export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/** Random delay between processor rounds (default 15–40s). */
export function nextProcessorDelayMs(
  minRaw = process.env.LEO_PROCESSOR_INTERVAL_MIN_MS,
  maxRaw = process.env.LEO_PROCESSOR_INTERVAL_MAX_MS
): number {
  const minMs = parsePositiveInt(minRaw, 15_000);
  const maxMs = parsePositiveInt(maxRaw, 40_000);
  const lo = Math.min(minMs, maxMs);
  const hi = Math.max(minMs, maxMs);
  if (lo === hi) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
