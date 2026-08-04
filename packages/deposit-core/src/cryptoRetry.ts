/**
 * Shared retry helper with exponential backoff for chain/exchange APIs.
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  opts?: {
    retries?: number;
    baseMs?: number;
    maxMs?: number;
    label?: string;
    isRetryable?: (err: unknown) => boolean;
  }
): Promise<T> {
  const retries = opts?.retries ?? 3;
  const baseMs = opts?.baseMs ?? 400;
  const maxMs = opts?.maxMs ?? 8_000;
  const label = opts?.label ?? "retry";
  const isRetryable =
    opts?.isRetryable ??
    ((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return (
        msg.includes("429") ||
        msg.includes("rate") ||
        msg.includes("timeout") ||
        msg.includes("abort") ||
        msg.includes("http_5") ||
        msg.includes("ECONNRESET") ||
        msg.includes("fetch failed")
      );
    });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !isRetryable(err)) throw err;
      const delay = Math.min(maxMs, baseMs * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 120);
      console.warn(`[Payment] ${label} retry`, {
        attempt: attempt + 1,
        delayMs: delay + jitter,
        err: err instanceof Error ? err.message : String(err),
      });
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }
  throw lastErr;
}
