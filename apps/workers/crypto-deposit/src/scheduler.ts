/**
 * Interval loops for crypto deposit scanning.
 * Business logic: @dingmoney/deposit-core (do not duplicate).
 */
import type { Pool } from "pg";
import {
  runActiveCryptoScan,
  runFullOfflineCryptoScan,
  getCryptoRedis,
} from "@dingmoney/deposit-core";

const LOCK = {
  active: "crypto_deposit:lock:active_scan",
  full: "crypto_deposit:lock:full_scan",
} as const;

export type CryptoScannerConfig = {
  activeIntervalMs: number;
  fullIntervalMs: number;
  fullPageSize: number;
  activeLockTtlSec: number;
  fullLockTtlSec: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRedisLock(
  lockKey: string,
  ttlSec: number,
  label: string,
  fn: () => Promise<void>
): Promise<"ran" | "skipped"> {
  const redis = getCryptoRedis();
  const acquired = await redis.setNxEx(lockKey, "1", ttlSec);
  if (!acquired) {
    console.log("[Payment] crypto scanner skip (lock held)", {
      label,
      lockKey,
      backend: redis.backend,
    });
    return "skipped";
  }

  try {
    await fn();
    return "ran";
  } finally {
    await redis.del(lockKey).catch(() => undefined);
  }
}

async function runFullScanAllPages(
  pool: Pool,
  pageSize: number
): Promise<{ pages: number; targets: number }> {
  let offset = 0;
  let pages = 0;
  let targets = 0;

  for (;;) {
    const summary = await runFullOfflineCryptoScan(pool, {
      limit: pageSize,
      offset,
    });
    pages += 1;
    targets += summary.targets;
    if (summary.targets < pageSize) break;
    offset += pageSize;
  }

  return { pages, targets };
}

/**
 * Starts active (~2m) and full (~6h) scanners. Returns a stop function.
 */
export function startCryptoScanners(
  pool: Pool,
  config: CryptoScannerConfig
): () => void {
  let stopped = false;
  let activeTimer: ReturnType<typeof setTimeout> | null = null;
  let fullTimer: ReturnType<typeof setTimeout> | null = null;
  let activeInFlight = false;
  let fullInFlight = false;

  const scheduleActive = (): void => {
    if (stopped) return;
    activeTimer = setTimeout(() => void runActiveTick(), config.activeIntervalMs);
  };

  const scheduleFull = (): void => {
    if (stopped) return;
    fullTimer = setTimeout(() => void runFullTick(), config.fullIntervalMs);
  };

  const runActiveTick = async (): Promise<void> => {
    if (stopped || activeInFlight) {
      scheduleActive();
      return;
    }
    activeInFlight = true;
    try {
      await withRedisLock(
        LOCK.active,
        config.activeLockTtlSec,
        "active_scan",
        async () => {
          console.log("[Payment] Railway active crypto scan tick");
          const summary = await runActiveCryptoScan(pool);
          console.log("[Payment] Railway active crypto scan tick done", {
            targets: summary.targets,
          });
        }
      );
    } catch (err) {
      console.error("[Payment] Railway active crypto scan failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      activeInFlight = false;
      scheduleActive();
    }
  };

  const runFullTick = async (): Promise<void> => {
    if (stopped || fullInFlight) {
      scheduleFull();
      return;
    }
    fullInFlight = true;
    try {
      await withRedisLock(
        LOCK.full,
        config.fullLockTtlSec,
        "full_scan",
        async () => {
          console.log("[Payment] Railway full offline crypto scan tick");
          const summary = await runFullScanAllPages(pool, config.fullPageSize);
          console.log("[Payment] Railway full offline crypto scan tick done", summary);
        }
      );
    } catch (err) {
      console.error("[Payment] Railway full offline crypto scan failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      fullInFlight = false;
      scheduleFull();
    }
  };

  console.log("[Payment] crypto scanners started", {
    activeIntervalMs: config.activeIntervalMs,
    fullIntervalMs: config.fullIntervalMs,
    fullPageSize: config.fullPageSize,
  });

  void (async () => {
    await sleep(1500);
    if (!stopped) void runActiveTick();
    await sleep(3000);
    if (!stopped) void runFullTick();
  })();

  return () => {
    stopped = true;
    if (activeTimer) clearTimeout(activeTimer);
    if (fullTimer) clearTimeout(fullTimer);
  };
}
