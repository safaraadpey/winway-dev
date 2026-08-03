/**
 * Tiny in-memory rate limiter for deposit create/verify (per-process).
 * Not a distributed limiter — still blocks obvious abuse on a single instance.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function takeRateLimitToken(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const now = Date.now();
  const existing = buckets.get(opts.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true };
  }
  if (existing.count >= opts.limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true };
}
