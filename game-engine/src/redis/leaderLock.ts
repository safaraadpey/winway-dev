import type { Logger } from "../metrics/logger.js";
import type { GameRedis } from "./types.js";
import { releaseLock, tryAcquireLock } from "./locks.js";

export interface LeaderLockAcquireResult {
  /** When false, another replica holds the lock — skip this tick. */
  proceed: boolean;
  lockHeld: boolean;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Acquire a Redis leader lock for a worker tick.
 * - No redis configured → proceed (single-instance).
 * - Lock held by peer → skip tick (proceed: false).
 * - Redis error → warn once, proceed without lock (degraded single-instance).
 */
export async function acquireLeaderLock(args: {
  redis: GameRedis | null;
  lockKey: string;
  ttlSec: number;
  token: string;
  worker: string;
  log: Logger;
  degraded: { value: boolean };
}): Promise<LeaderLockAcquireResult> {
  if (!args.redis) {
    return { proceed: true, lockHeld: false };
  }

  try {
    const haveLock = await tryAcquireLock(
      args.redis,
      args.lockKey,
      args.ttlSec,
      args.token
    );
    if (!haveLock) {
      return { proceed: false, lockHeld: false };
    }
    return { proceed: true, lockHeld: true };
  } catch (lockErr) {
    if (!args.degraded.value) {
      args.degraded.value = true;
      args.log.warn(`${args.worker} redis lock failed; continuing single-instance mode`, {
        error: errMessage(lockErr),
      });
    }
    return { proceed: true, lockHeld: false };
  }
}

export async function releaseLeaderLock(args: {
  redis: GameRedis | null;
  lockKey: string;
  token: string;
  lockHeld: boolean;
  worker: string;
  log: Logger;
}): Promise<void> {
  if (!args.redis || !args.lockHeld) return;
  await releaseLock(args.redis, args.lockKey, args.token).catch((err: unknown) =>
    args.log.error(`${args.worker} lock release failed`, {
      error: errMessage(err),
    })
  );
}
