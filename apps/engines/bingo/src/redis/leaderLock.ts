import type { Logger } from "../metrics/logger.js";
import { shouldFailClosedWithoutRedis } from "../coordination/rolePolicy.js";
import type { GameRedis } from "./types.js";
import { releaseLock, tryAcquireLock } from "./locks.js";

export interface LeaderLockAcquireResult {
  /** When false, another replica holds the lock — skip this tick. */
  proceed: boolean;
  lockHeld: boolean;
  /** True when the acquire raced past {@link acquireLeaderLockWithTimeout}. */
  timedOut?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  coordinationStrict?: boolean;
  engineReplicaCount?: number;
}): Promise<LeaderLockAcquireResult> {
  const failClosed = shouldFailClosedWithoutRedis({
    coordinationStrict: args.coordinationStrict === true,
    engineReplicaCount: args.engineReplicaCount ?? 1,
  });

  if (!args.redis) {
    if (failClosed) {
      return { proceed: false, lockHeld: false };
    }
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
    if (failClosed) {
      return { proceed: false, lockHeld: false };
    }
    return { proceed: true, lockHeld: false };
  }
}

/**
 * Bounded leader lock acquire for hot paths.
 * Never waits longer than timeoutMs; late acquires are released immediately.
 */
export async function acquireLeaderLockWithTimeout(
  args: {
    redis: GameRedis | null;
    lockKey: string;
    ttlSec: number;
    token: string;
    worker: string;
    log: Logger;
    degraded: { value: boolean };
    timeoutMs: number;
    coordinationStrict?: boolean;
    engineReplicaCount?: number;
  }
): Promise<LeaderLockAcquireResult> {
  const failClosed = shouldFailClosedWithoutRedis({
    coordinationStrict: args.coordinationStrict === true,
    engineReplicaCount: args.engineReplicaCount ?? 1,
  });

  if (!args.redis) {
    if (failClosed) {
      return { proceed: false, lockHeld: false };
    }
    return { proceed: true, lockHeld: false };
  }

  let timedOut = false;

  const acquireTask = acquireLeaderLock(args).then((result) => {
    if (timedOut) {
      if (result.lockHeld) {
        void releaseLeaderLock({
          redis: args.redis,
          lockKey: args.lockKey,
          token: args.token,
          lockHeld: true,
          worker: args.worker,
          log: args.log,
        });
      }
      return { proceed: false, lockHeld: false, timedOut: true };
    }
    return result;
  });

  const timeoutTask = sleep(args.timeoutMs).then(() => {
    timedOut = true;
    return { proceed: false, lockHeld: false, timedOut: true };
  });

  return Promise.race([acquireTask, timeoutTask]);
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
