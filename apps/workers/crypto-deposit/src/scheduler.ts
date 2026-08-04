/**
 * Interval loops for crypto deposit scanning (Hot / Warm / Cold / Confirm).
 * Business logic: @dingmoney/deposit-core (do not duplicate).
 */
import type { Pool } from "pg";
import {
  runHotAndConfirmCryptoScan,
  runWarmCryptoScan,
  runFullOfflineCryptoScan,
  getCryptoRedis,
} from "@dingmoney/deposit-core";

const LOCK = {
  hotConfirm: "crypto_deposit:lock:hot_confirm_scan",
  warm: "crypto_deposit:lock:warm_scan",
  cold: "crypto_deposit:lock:full_scan",
  /** legacy — ignore if held by older worker builds */
  activeLegacy: "crypto_deposit:lock:active_scan",
} as const;

export type CryptoScannerConfig = {
  /** Confirmation + Hot (default 15s) */
  hotConfirmIntervalMs: number;
  /** Warm online (default 30s) */
  warmIntervalMs: number;
  /** Cold full (default 6h) */
  fullIntervalMs: number;
  fullPageSize: number;
  /** Crash-recovery TTLs only — locks are deleted in finally */
  hotConfirmLockTtlSec: number;
  warmLockTtlSec: number;
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
    // Spec: release immediately after success or failure; TTL is crash-only.
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
 * Starts Hot+Confirm (~15s), Warm (~30s), Cold (~6h). Returns stop fn.
 */
export function startCryptoScanners(
  pool: Pool,
  config: CryptoScannerConfig
): () => void {
  let stopped = false;
  let hotTimer: ReturnType<typeof setTimeout> | null = null;
  let warmTimer: ReturnType<typeof setTimeout> | null = null;
  let fullTimer: ReturnType<typeof setTimeout> | null = null;
  let hotInFlight = false;
  let warmInFlight = false;
  let fullInFlight = false;

  const scheduleHot = (): void => {
    if (stopped) return;
    hotTimer = setTimeout(
      () => void runHotConfirmTick(),
      config.hotConfirmIntervalMs
    );
  };

  const scheduleWarm = (): void => {
    if (stopped) return;
    warmTimer = setTimeout(() => void runWarmTick(), config.warmIntervalMs);
  };

  const scheduleFull = (): void => {
    if (stopped) return;
    fullTimer = setTimeout(() => void runFullTick(), config.fullIntervalMs);
  };

  const runHotConfirmTick = async (): Promise<void> => {
    if (stopped || hotInFlight) {
      scheduleHot();
      return;
    }
    hotInFlight = true;
    try {
      await withRedisLock(
        LOCK.hotConfirm,
        config.hotConfirmLockTtlSec,
        "hot_confirm_scan",
        async () => {
          console.log("[Payment] Railway hot+confirm crypto scan tick");
          const summary = await runHotAndConfirmCryptoScan(pool);
          console.log("[Payment] Railway hot+confirm crypto scan tick done", {
            confirmTargets: summary.confirm.targets,
            hotTargets: summary.hot.targets,
          });
        }
      );
    } catch (err) {
      console.error("[Payment] Railway hot+confirm crypto scan failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      hotInFlight = false;
      scheduleHot();
    }
  };

  const runWarmTick = async (): Promise<void> => {
    if (stopped || warmInFlight) {
      scheduleWarm();
      return;
    }
    warmInFlight = true;
    try {
      await withRedisLock(
        LOCK.warm,
        config.warmLockTtlSec,
        "warm_scan",
        async () => {
          console.log("[Payment] Railway warm crypto scan tick");
          const summary = await runWarmCryptoScan(pool);
          console.log("[Payment] Railway warm crypto scan tick done", {
            targets: summary.targets,
          });
        }
      );
    } catch (err) {
      console.error("[Payment] Railway warm crypto scan failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      warmInFlight = false;
      scheduleWarm();
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
        LOCK.cold,
        config.fullLockTtlSec,
        "cold_scan",
        async () => {
          console.log("[Payment] Railway cold crypto scan tick");
          const summary = await runFullScanAllPages(pool, config.fullPageSize);
          console.log("[Payment] Railway cold crypto scan tick done", summary);
        }
      );
    } catch (err) {
      console.error("[Payment] Railway cold crypto scan failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      fullInFlight = false;
      scheduleFull();
    }
  };

  console.log("[Payment] crypto scanners started", {
    hotConfirmIntervalMs: config.hotConfirmIntervalMs,
    warmIntervalMs: config.warmIntervalMs,
    fullIntervalMs: config.fullIntervalMs,
    fullPageSize: config.fullPageSize,
  });

  void (async () => {
    await sleep(1500);
    if (!stopped) void runHotConfirmTick();
    await sleep(1500);
    if (!stopped) void runWarmTick();
    await sleep(3000);
    if (!stopped) void runFullTick();
  })();

  return () => {
    stopped = true;
    if (hotTimer) clearTimeout(hotTimer);
    if (warmTimer) clearTimeout(warmTimer);
    if (fullTimer) clearTimeout(fullTimer);
  };
}
