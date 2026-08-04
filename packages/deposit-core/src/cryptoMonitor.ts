/**
 * Orchestrates chain scans for one or many users.
 */
import type { Pool } from "pg";
import { scanBep20Address } from "./cryptoScanners/etherscan";
import { scanTrc20Address } from "./cryptoScanners/trongrid";
import {
  processObservedDeposit,
  type ProcessResult,
} from "./cryptoDepositProcessor";
import { listActiveCryptoTargets } from "./cryptoActiveScan";

export type ScanUserResult = {
  userId: string;
  bep20Address: string;
  trc20Address: string;
  observed: number;
  results: ProcessResult[];
  errors: string[];
};

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

/** Layer 2 — active Redis set, every ~2 minutes */
export async function runActiveCryptoScan(pool: Pool): Promise<{
  targets: number;
  scans: ScanUserResult[];
}> {
  const targets = await listActiveCryptoTargets();
  console.log("[Payment] active crypto scan start", { count: targets.length });

  const scans: ScanUserResult[] = [];
  for (const t of targets) {
    scans.push(
      await scanUserAddresses(pool, {
        userId: t.userId,
        bep20Address: t.bep20Address,
        trc20Address: t.trc20Address,
        preferPriceLock: true,
      })
    );
  }

  console.log("[Payment] active crypto scan done", {
    targets: targets.length,
    confirmed: scans.reduce(
      (n, s) => n + s.results.filter((r) => r.action === "confirmed").length,
      0
    ),
  });

  return { targets: targets.length, scans };
}

/** Layer 3 — all DB addresses, every ~6 hours (live rates, no price lock) */
export async function runFullOfflineCryptoScan(
  pool: Pool,
  opts?: { limit?: number; offset?: number }
): Promise<{
  targets: number;
  scans: ScanUserResult[];
}> {
  const limit = opts?.limit ?? 200;
  const offset = opts?.offset ?? 0;

  const { rows } = await pool.query(
    `
    SELECT user_id, bep20_address, trc20_address
    FROM deposit.user_crypto_addresses
    ORDER BY created_at ASC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset]
  );

  console.log("[Payment] full offline crypto scan start", {
    count: rows.length,
    limit,
    offset,
  });

  const scans: ScanUserResult[] = [];
  for (const r of rows) {
    scans.push(
      await scanUserAddresses(pool, {
        userId: String(r.user_id),
        bep20Address: String(r.bep20_address),
        trc20Address: String(r.trc20_address),
        preferPriceLock: false,
      })
    );
  }

  console.log("[Payment] full offline crypto scan done", {
    targets: rows.length,
  });

  return { targets: rows.length, scans };
}
