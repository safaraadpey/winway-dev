/**
 * One-time / manual backfill: re-run fn_performance_snapshot_run per accounting day.
 * Each day is a separate call (no multi-day plpgsql loop) to avoid statement timeout.
 */
import "dotenv/config";
import { createPool } from "./db.js";
import { executeSnapshotRun } from "./run.js";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function parseDateString(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

function formatDateString(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCalendarDays(dateStr: string, days: number): string {
  const d = parseDateString(dateStr);
  if (!d) throw new Error(`Invalid date: ${dateStr}`);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateString(d);
}

function* dateRangeInclusive(from: string, through: string): Generator<string> {
  let current = from;
  while (current <= through) {
    yield current;
    current = addCalendarDays(current, 1);
  }
}

async function resolveBackfillBounds(databaseUrl: string): Promise<{
  fromDate: string;
  throughDate: string;
}> {
  const pool = createPool(databaseUrl);
  try {
    const fromOverride = process.env.BACKFILL_FROM_DATE?.trim() || null;
    const throughOverride = process.env.BACKFILL_THROUGH_DATE?.trim() || null;

    if (fromOverride && !parseDateString(fromOverride)) {
      throw new Error(`Invalid BACKFILL_FROM_DATE: ${fromOverride}`);
    }
    if (throughOverride && !parseDateString(throughOverride)) {
      throw new Error(`Invalid BACKFILL_THROUGH_DATE: ${throughOverride}`);
    }

    const [{ rows: minRows }, { rows: defaultRows }] = await Promise.all([
      pool.query<{ min_date: string | null }>(
        `SELECT MIN(snapshot_date)::text AS min_date FROM public.performance_daily_stats`
      ),
      pool.query<{ default_date: string }>(
        `SELECT public.fn_performance_default_snapshot_date()::text AS default_date`
      ),
    ]);

    const minDate = minRows[0]?.min_date ?? null;
    const defaultDate = defaultRows[0]?.default_date;
    if (!defaultDate) {
      throw new Error("fn_performance_default_snapshot_date() returned no value");
    }

    const fromDate = fromOverride ?? minDate;
    if (!fromDate) {
      throw new Error(
        "No existing snapshot rows; set BACKFILL_FROM_DATE=YYYY-MM-DD to seed backfill"
      );
    }

    const throughDate = throughOverride ?? defaultDate;
    if (fromDate > throughDate) {
      throw new Error(`Backfill range invalid: from=${fromDate} through=${throughDate}`);
    }

    return { fromDate, throughDate };
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const { fromDate, throughDate } = await resolveBackfillBounds(databaseUrl);

  const dates = [...dateRangeInclusive(fromDate, throughDate)];
  console.log("[PerformanceSnapshot] backfill started", {
    fromDate,
    throughDate,
    dayCount: dates.length,
  });

  let succeeded = 0;
  let failed = 0;

  for (const snapshotDate of dates) {
    console.log("[PerformanceSnapshot] backfill day", { snapshotDate });
    try {
      const result = await executeSnapshotRun({ databaseUrl, snapshotDate });
      if (!result) {
        console.warn("[PerformanceSnapshot] backfill day skipped (lock held)", {
          snapshotDate,
        });
        failed += 1;
        continue;
      }
      if (result.status !== "succeeded") {
        console.error("[PerformanceSnapshot] backfill day failed", {
          snapshotDate,
          status: result.status,
        });
        failed += 1;
        continue;
      }
      console.log("[PerformanceSnapshot] backfill day finished", {
        snapshotDate,
        rowCount: result.rowCount,
        lifetimeRowCount: result.lifetimeRowCount,
      });
      succeeded += 1;
    } catch (error) {
      console.error("[PerformanceSnapshot] backfill day error", {
        snapshotDate,
        error,
      });
      failed += 1;
    }
  }

  console.log("[PerformanceSnapshot] backfill finished", {
    fromDate,
    throughDate,
    succeeded,
    failed,
    total: dates.length,
  });

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[PerformanceSnapshot] backfill fatal", err);
  process.exit(1);
});
