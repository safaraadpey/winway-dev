/**
 * Feature flag for browser-side immutable card pool definitions cache.
 */

export function isCardPoolCacheEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_CARD_POOL_CACHE === "true";
}
