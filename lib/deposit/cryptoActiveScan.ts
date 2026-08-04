/**
 * Mark user addresses as actively scanned (TTL 30 min).
 */
import {
  CRYPTO_REDIS_KEYS,
  CRYPTO_TTL,
  getCryptoRedis,
} from "@/lib/deposit/cryptoRedis";

export type ActiveCryptoTarget = {
  userId: string;
  bep20Address: string;
  trc20Address: string;
  expiresAt: string;
};

export async function registerActiveCryptoAddresses(
  target: Omit<ActiveCryptoTarget, "expiresAt">
): Promise<ActiveCryptoTarget> {
  const redis = getCryptoRedis();
  const expiresAt = new Date(
    Date.now() + CRYPTO_TTL.ACTIVE_ADDRESS_SEC * 1000
  ).toISOString();

  const payload: ActiveCryptoTarget = { ...target, expiresAt };

  await redis.sadd(CRYPTO_REDIS_KEYS.ACTIVE_SET, target.userId);
  await redis.setJson(
    CRYPTO_REDIS_KEYS.activeMeta(target.userId),
    payload,
    CRYPTO_TTL.ACTIVE_ADDRESS_SEC
  );

  console.log("[Payment] active crypto address registered", {
    userId: target.userId,
    expiresAt,
    backend: redis.backend,
  });

  return payload;
}

export async function listActiveCryptoTargets(): Promise<ActiveCryptoTarget[]> {
  const redis = getCryptoRedis();
  const userIds = await redis.smembers(CRYPTO_REDIS_KEYS.ACTIVE_SET);
  const out: ActiveCryptoTarget[] = [];

  for (const userId of userIds) {
    const meta = await redis.getJson<ActiveCryptoTarget>(
      CRYPTO_REDIS_KEYS.activeMeta(userId)
    );
    if (!meta) {
      await redis.srem(CRYPTO_REDIS_KEYS.ACTIVE_SET, userId);
      continue;
    }
    if (new Date(meta.expiresAt).getTime() <= Date.now()) {
      await redis.srem(CRYPTO_REDIS_KEYS.ACTIVE_SET, userId);
      await redis.del(CRYPTO_REDIS_KEYS.activeMeta(userId));
      continue;
    }
    out.push(meta);
  }

  return out;
}

export async function tryAcquireCheckCooldown(userId: string): Promise<boolean> {
  const redis = getCryptoRedis();
  return redis.setNxEx(
    CRYPTO_REDIS_KEYS.checkCooldown(userId),
    "1",
    CRYPTO_TTL.CHECK_COOLDOWN_SEC
  );
}
