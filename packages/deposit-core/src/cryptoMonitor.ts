/**
 * Orchestrates chain scans for Hot / Warm / Cold / Confirmation watches.
 */
import type { Pool } from "pg";
import { scanBep20Address } from "./cryptoScanners/etherscan";
import { scanTrc20Address } from "./cryptoScanners/trongrid";
import {
  processObservedDeposit,
  type ProcessResult,
} from "./cryptoDepositProcessor";
import {
  clearConfirmIfNoPending,
  listColdScanTargets,
  listConfirmWatchTargets,
  listHotWatchTargets,
  listWarmWatchTargets,
  syncConfirmWatchFromPending,
  type CryptoWatchTarget,
} from "./cryptoWatch";

export type ScanUserResult = {
  userId: string;
  bep20Address: string;
  trc20Address: string;
  observed: number;
  results: ProcessResult[];
  errors: string[];
  tier?: string;
};

const DEFAULT_CONCURRENCY = 4;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }
  );
  await Promise.all(workers);
  return out;
}

export async function scanUserAddresses(
  pool: Pool,
  opts: {
    userId: string;
    bep20Address: string;
    trc20Address: string;
    preferPriceLock: boolean;
  }
): Promise<ScanUserResult> {
  const errors: string[] = [];
  let observedTxs = [] as Awaited<ReturnType<typeof scanBep20Address>>;

  try {
    const [bep, trc] = await Promise.all([
      scanBep20Address(opts.bep20Address),
      scanTrc20Address(opts.trc20Address),
    ]);
    observedTxs = [...bep, ...trc];
  } catch (err) {
    const message = err instanceof Error ? err.message : "scan_failed";
    errors.push(message);
    console.error("[Payment] scan user addresses failed", {
      userId: opts.userId,
      message,
    });
  }

  const results: ProcessResult[] = [];
  for (const obs of observedTxs) {
    try {
      const r = await processObservedDeposit(pool, {
        userId: opts.userId,
        observed: obs,
        preferPriceLock: opts.preferPriceLock,
      });
      results.push(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : "process_failed";
      results.push({
        txHash: obs.txHash,
        eventIndex: obs.eventIndex ?? 0,
        action: "failed",
        error: message,
      });
    }
  }

  return {
    userId: opts.userId,
    bep20Address: opts.bep20Address,
    trc20Address: opts.trc20Address,
    observed: observedTxs.length,
    results,
    errors,
  };
}

async function scanTargets(
  pool: Pool,
  targets: CryptoWatchTarget[],
  opts: {
    preferPriceLock: boolean;
    label: string;
    concurrency?: number;
  }
): Promise<{ targets: number; scans: ScanUserResult[] }> {
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  console.log(`[Payment] ${opts.label} scan start`, {
    count: targets.length,
    concurrency,
  });

  const scans = await mapPool(targets, concurrency, async (t) => {
    const scan = await scanUserAddresses(pool, {
      userId: t.userId,
      bep20Address: t.bep20Address,
      trc20Address: t.trc20Address,
      preferPriceLock: opts.preferPriceLock,
    });
    return { ...scan, tier: t.tier };
  });

  const confirmed = scans.reduce(
    (n, s) => n + s.results.filter((r) => r.action === "confirmed").length,
    0
  );
  console.log(`[Payment] ${opts.label} scan done`, {
    targets: targets.length,
    confirmed,
  });

  return { targets: targets.length, scans };
}

/** Confirmation Watch — pending txs until CONFIRMED/FAILED (every ~15s). */
export async function runConfirmCryptoScan(pool: Pool): Promise<{
  targets: number;
  scans: ScanUserResult[];
}> {
  await syncConfirmWatchFromPending(pool);
  const targets = await listConfirmWatchTargets();
  const summary = await scanTargets(pool, targets, {
    preferPriceLock: true,
    label: "confirm",
  });

  for (const t of targets) {
    await clearConfirmIfNoPending(pool, t.userId);
  }

  return summary;
}

/** Hot Watch — deposit-page activity (every ~15s). */
export async function runHotCryptoScan(pool: Pool): Promise<{
  targets: number;
  scans: ScanUserResult[];
}> {
  const confirm = await listConfirmWatchTargets();
  const exclude = new Set(confirm.map((t) => t.userId));
  const targets = await listHotWatchTargets({ excludeUserIds: exclude });
  return scanTargets(pool, targets, {
    preferPriceLock: true,
    label: "hot",
  });
}

/** Warm Watch — online, not Hot/Confirm (every ~30s). */
export async function runWarmCryptoScan(pool: Pool): Promise<{
  targets: number;
  scans: ScanUserResult[];
}> {
  const confirm = await listConfirmWatchTargets();
  const hot = await listHotWatchTargets({
    excludeUserIds: new Set(confirm.map((t) => t.userId)),
  });
  const exclude = new Set([
    ...confirm.map((t) => t.userId),
    ...hot.map((t) => t.userId),
  ]);
  const targets = await listWarmWatchTargets(pool, { excludeUserIds: exclude });
  return scanTargets(pool, targets, {
    preferPriceLock: true,
    label: "warm",
  });
}

/**
 * Combined 15s tick: Confirmation first, then Hot (exclusive).
 */
export async function runHotAndConfirmCryptoScan(pool: Pool): Promise<{
  confirm: { targets: number; scans: ScanUserResult[] };
  hot: { targets: number; scans: ScanUserResult[] };
}> {
  const confirm = await runConfirmCryptoScan(pool);
  const hot = await runHotCryptoScan(pool);
  return { confirm, hot };
}

/** @deprecated use runHotCryptoScan / runHotAndConfirmCryptoScan */
export async function runActiveCryptoScan(pool: Pool): Promise<{
  targets: number;
  scans: ScanUserResult[];
}> {
  const both = await runHotAndConfirmCryptoScan(pool);
  return {
    targets: both.confirm.targets + both.hot.targets,
    scans: [...both.confirm.scans, ...both.hot.scans],
  };
}

/** Cold Scan — allocated addresses not Confirm/Hot/Warm (every ~6h). */
export async function runFullOfflineCryptoScan(
  pool: Pool,
  opts?: { limit?: number; offset?: number }
): Promise<{
  targets: number;
  scans: ScanUserResult[];
}> {
  const limit = opts?.limit ?? 200;
  const offset = opts?.offset ?? 0;

  const confirm = await listConfirmWatchTargets();
  const hot = await listHotWatchTargets({
    excludeUserIds: new Set(confirm.map((t) => t.userId)),
  });
  const warm = await listWarmWatchTargets(pool, {
    excludeUserIds: new Set([
      ...confirm.map((t) => t.userId),
      ...hot.map((t) => t.userId),
    ]),
  });
  const exclude = new Set([
    ...confirm.map((t) => t.userId),
    ...hot.map((t) => t.userId),
    ...warm.map((t) => t.userId),
  ]);

  const targets = await listColdScanTargets(pool, {
    limit,
    offset,
    excludeUserIds: exclude,
  });

  console.log("[Payment] full offline crypto scan start", {
    count: targets.length,
    limit,
    offset,
    excluded: exclude.size,
  });

  return scanTargets(pool, targets, {
    preferPriceLock: false,
    label: "cold",
  });
}
