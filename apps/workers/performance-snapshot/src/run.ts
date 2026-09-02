import {
  createPool,
  releaseAdvisoryLock,
  tryAdvisoryLock,
} from "./db.js";
import { tehranSnapshotDate } from "./tehran.js";

export type SnapshotRunConfig = {
  databaseUrl: string;
  /** Optional override; default = fn_performance_default_snapshot_date() in DB. */
  snapshotDate?: string | null;
};

export type SnapshotRunResult = {
  snapshotDate: string;
  rowCount: number;
  status: string;
  windowFrom: string | null;
  windowTo: string | null;
};

export async function executeSnapshotRun(
  config: SnapshotRunConfig
): Promise<SnapshotRunResult | null> {
  const pool = createPool(config.databaseUrl);
  const client = await pool.connect();

  try {
    const locked = await tryAdvisoryLock(client);
    if (!locked) {
      console.log("[PerformanceSnapshot] skip — advisory lock held");
      return null;
    }

    const snapshotDate = config.snapshotDate?.trim() || null;
    console.log("[PerformanceSnapshot] run started", {
      snapshotDate: snapshotDate ?? "(default from DB)",
      tehranToday: tehranSnapshotDate(),
    });

    const { rows } = await client.query<{
      out_snapshot_date: string;
      out_row_count: number;
      out_status: string;
    }>(
      `SELECT out_snapshot_date, out_row_count, out_status
       FROM public.fn_performance_snapshot_run($1::date)`,
      [snapshotDate]
    );

    const result = rows[0];
    if (!result) {
      throw new Error("fn_performance_snapshot_run returned no row");
    }

    const windowRes = await client.query<{
      window_from: Date;
      window_to: Date;
    }>(
      `SELECT window_from, window_to
       FROM public.fn_performance_accounting_window($1::date)`,
      [result.out_snapshot_date]
    );

    const window = windowRes.rows[0];

    const payload: SnapshotRunResult = {
      snapshotDate: result.out_snapshot_date,
      rowCount: Number(result.out_row_count ?? 0),
      status: String(result.out_status ?? "unknown"),
      windowFrom: window?.window_from?.toISOString() ?? null,
      windowTo: window?.window_to?.toISOString() ?? null,
    };

    console.log("[PerformanceSnapshot] run finished", payload);
    return payload;
  } finally {
    await releaseAdvisoryLock(client).catch(() => undefined);
    client.release();
    await pool.end();
  }
}
