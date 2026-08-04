/**
 * Backward-compatible Hot Watch helpers (formerly "active" scan set).
 */
import {
  CRYPTO_REDIS_KEYS,
  CRYPTO_TTL,
  getCryptoRedis,
} from "./cryptoRedis";
import {
  touchHotWatch,
  listHotWatchTargets,
  type CryptoWatchTarget,
} from "./cryptoWatch";

export type ActiveCryptoTarget = CryptoWatchTarget;

export { touchHotWatch, listHotWatchTargets };

export async function registerActiveCryptoAddresses(opts: {
  userId: string;
  bep20Address: string;
  trc20Address: string;
}): Promise<ActiveCryptoTarget> {
  return touchHotWatch(opts);
}

export async function listActiveCryptoTargets(): Promise<ActiveCryptoTarget[]> {
  return listHotWatchTargets();
}

export async function tryAcquireCheckCooldown(userId: string): Promise<boolean> {
  const redis = getCryptoRedis();
  return redis.setNxEx(
    CRYPTO_REDIS_KEYS.checkCooldown(userId),
    "1",
    CRYPTO_TTL.CHECK_COOLDOWN_SEC
  );
}
