import type { GameRedis } from "./types.js";

export async function tryAcquireLock(
  redis: GameRedis,
  key: string,
  ttlSeconds: number,
  token: string
): Promise<boolean> {
  return redis.tryAcquireLock(key, token, ttlSeconds);
}

export async function releaseLock(
  redis: GameRedis,
  key: string,
  token: string
): Promise<void> {
  return redis.releaseLock(key, token);
}
