import type { Pool, PoolClient } from "pg";
import type { RunContext, SourceCounts } from "./types.js";

export function initCounts(): SourceCounts {
  return { read: 0, inserted: 0, skipped_existing: 0 };
}

export function bumpRead(ctx: RunContext, sourceKey: string, n: number): void {
  ctx.rowCounts[sourceKey] ??= initCounts();
  ctx.rowCounts[sourceKey].read += n;
}

export function bumpInserted(ctx: RunContext, sourceKey: string, n: number): void {
  ctx.rowCounts[sourceKey] ??= initCounts();
  ctx.rowCounts[sourceKey].inserted += n;
}

export function bumpSkipped(ctx: RunContext, sourceKey: string, n: number): void {
  ctx.rowCounts[sourceKey] ??= initCounts();
  ctx.rowCounts[sourceKey].skipped_existing += n;
}

export type Watermark = {
  lastCreatedAt: Date | null;
  lastId: string | null;
  lastSourceUpdatedAt: Date | null;
};

export async function loadWatermark(
  backup: PoolClient,
  sourceKey: string
): Promise<Watermark> {
  const { rows } = await backup.query<{
    last_created_at: Date | null;
    last_id: string | null;
    last_source_updated_at: Date | null;
  }>(
    `SELECT last_created_at, last_id, last_source_updated_at
     FROM archive.watermarks WHERE source_key = $1`,
    [sourceKey]
  );
  const row = rows[0];
  return {
    lastCreatedAt: row?.last_created_at ?? null,
    lastId: row?.last_id ?? null,
    lastSourceUpdatedAt: row?.last_source_updated_at ?? null,
  };
}

export async function saveWatermark(
  backup: PoolClient,
  runId: string,
  sourceKey: string,
  wm: Watermark,
  rowsAdded: number
): Promise<void> {
  await backup.query(
    `INSERT INTO archive.watermarks (
       source_key, last_created_at, last_id, last_source_updated_at,
       rows_copied_total, updated_run_id, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (source_key) DO UPDATE SET
       last_created_at = EXCLUDED.last_created_at,
       last_id = EXCLUDED.last_id,
       last_source_updated_at = EXCLUDED.last_source_updated_at,
       rows_copied_total = archive.watermarks.rows_copied_total + EXCLUDED.rows_copied_total,
       updated_run_id = EXCLUDED.updated_run_id,
       updated_at = now()`,
    [
      sourceKey,
      wm.lastCreatedAt,
      wm.lastId,
      wm.lastSourceUpdatedAt,
      rowsAdded,
      runId,
    ]
  );
}

export async function touchHeartbeat(pool: Pool, runId: string): Promise<void> {
  await pool.query(
    `UPDATE archive.snapshot_runs SET heartbeat_at = now() WHERE run_id = $1`,
    [runId]
  );
}

export async function persistRowCounts(
  pool: Pool,
  runId: string,
  rowCounts: Record<string, SourceCounts>
): Promise<void> {
  await pool.query(
    `UPDATE archive.snapshot_runs SET row_counts = $2::jsonb WHERE run_id = $1`,
    [runId, JSON.stringify(rowCounts)]
  );
}

export async function persistChecksums(
  pool: Pool,
  runId: string,
  checksums: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `UPDATE archive.snapshot_runs SET checksums = $2::jsonb WHERE run_id = $1`,
    [runId, JSON.stringify(checksums)]
  );
}

export async function finishRun(
  pool: Pool,
  runId: string,
  status: "succeeded" | "failed",
  error?: string
): Promise<void> {
  await pool.query(
    `UPDATE archive.snapshot_runs
     SET status = $2, finished_at = now(), error = $3, heartbeat_at = now()
     WHERE run_id = $1`,
    [runId, status, error ?? null]
  );
}
