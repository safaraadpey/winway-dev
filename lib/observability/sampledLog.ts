const counters = new Map<string, number>();

/**
 * Rate-limited console.info — logs on first call and every `sampleEvery` invocations.
 * No PII; use stable keys per metric surface.
 */
export function sampledLog(
  key: string,
  message: string,
  payload: Record<string, unknown>,
  sampleEvery = 100
): void {
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);
  if (n === 1 || n % sampleEvery === 0) {
    console.info(message, { ...payload, sample: { n, every: sampleEvery } });
  }
}

/** Reset counters (tests only). */
export function resetSampledLogCounters(): void {
  counters.clear();
}
