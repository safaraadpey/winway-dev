import type { Pool } from "pg";
import {
  createBackupPool,
  createProdPool,
  releaseBackupAdvisoryLock,
  tryBackupAdvisoryLock,
  withProdReadOnly,
} from "./db.js";
import { tehranSnapshotDate } from "./tehran.js";
import {
  finishRun,
  persistRowCounts,
  touchHeartbeat,
} from "./runControl.js";
import {
  copyAllLedgers,
  copyStateSnapshots,
} from "./sources.js";
import { copyGameArchive } from "./gameArchive.js";
import { copyStorageArchive, type StorageEnv } from "./storageArchive.js";
import { saveChecksumResult, verifyChecksums } from "./checksum.js";
import type { RunContext } from "./types.js";

export type BackupConfig = {
  prodDatabaseUrl: string;
  backupDatabaseUrl: string;
  storage: StorageEnv;
  batchSize: number;
  staleRunMinutes: number;
  heartbeatIntervalMs: number;
};

export async function executeBackupRun(config: BackupConfig): Promise<void> {
  const prodPool = createProdPool(config.prodDatabaseUrl);
  const backupPool = createBackupPool(config.backupDatabaseUrl);

  const backupClient = await backupPool.connect();
  let runId: string | null = null;
  let ctx: RunContext | null = null;

  try {
    const locked = await tryBackupAdvisoryLock(backupClient);
    if (!locked) {
      console.log("[Backup] skip — advisory lock held on backup DB");
      return;
    }

    const snapshotDate = tehranSnapshotDate();
    const staleMs = config.staleRunMinutes * 60 * 1000;

    const existing = await backupClient.query<{
      run_id: string;
      status: string;
      heartbeat_at: Date;
    }>(
      `SELECT run_id, status, heartbeat_at FROM archive.snapshot_runs
       WHERE snapshot_date = $1`,
      [snapshotDate]
    );

    const row = existing.rows[0];
    if (row?.status === "succeeded") {
      console.log("[Backup] skip — already succeeded", { snapshotDate });
      return;
    }

    const now = new Date();
    if (
      row &&
      row.status === "running" &&
      now.getTime() - new Date(row.heartbeat_at).getTime() < staleMs
    ) {
      console.log("[Backup] skip — run in progress", {
        snapshotDate,
        runId: row.run_id,
      });
      return;
    }

    if (row && (row.status === "failed" || row.status === "running")) {
      runId = row.run_id;
      await backupClient.query(
        `UPDATE archive.snapshot_runs
         SET status = 'running', heartbeat_at = now(), read_as_of = now(), error = null
         WHERE run_id = $1`,
        [runId]
      );
      console.log("[Backup] resume run", { runId, snapshotDate });
    } else {
      const inserted = await backupClient.query<{ run_id: string }>(
        `INSERT INTO archive.snapshot_runs (
           snapshot_date, status, started_at, read_as_of, heartbeat_at
         ) VALUES ($1, 'running', now(), now(), now())
         ON CONFLICT (snapshot_date) DO NOTHING
         RETURNING run_id`,
        [snapshotDate]
      );
      if (inserted.rows[0]) {
        runId = inserted.rows[0].run_id;
      } else {
        const again = await backupClient.query<{ run_id: string; status: string }>(
          `SELECT run_id, status FROM archive.snapshot_runs WHERE snapshot_date = $1`,
          [snapshotDate]
        );
        if (again.rows[0]?.status === "succeeded") return;
        runId = again.rows[0]?.run_id ?? null;
      }
      console.log("[Backup] started", { runId, snapshotDate });
    }

    if (!runId) {
      throw new Error("Failed to open snapshot run");
    }

    const readAsOf = now;
    ctx = {
      runId,
      snapshotDate,
      readAsOf,
      prodPool,
      backupPool,
      rowCounts: {},
      batchSize: config.batchSize,
    };

    const heartbeatTimer = setInterval(() => {
      void touchHeartbeat(backupPool, runId!).catch((err) => {
        console.error("[Backup] heartbeat failed", err);
      });
    }, config.heartbeatIntervalMs);

    try {
      await withProdReadOnly(prodPool, async (prod) => {
        const backup = await backupPool.connect();
        try {
          console.log("[Backup] phase ledgers");
          await copyAllLedgers(ctx!, prod, backup);

          console.log("[Backup] phase state snapshots");
          await copyStateSnapshots(ctx!, prod, backup);

          console.log("[Backup] phase game archive");
          await copyGameArchive(ctx!, prod, backup);
        } finally {
          backup.release();
        }
      });

      console.log("[Backup] phase storage");
      await copyStorageArchive(ctx!, config.storage);

      await withProdReadOnly(prodPool, async (prod) => {
        const checksum = await verifyChecksums(ctx!, prod);
        await saveChecksumResult(backupPool, runId!, checksum);
        if (!checksum.ok) {
          throw new Error(
            `Checksum failed: ${checksum.errors.join("; ")}`
          );
        }
        console.log("[Backup] checksum ok", checksum.details);
      });

      await persistRowCounts(backupPool, runId, ctx!.rowCounts);
      await finishRun(backupPool, runId, "succeeded");
      console.log("[Backup] succeeded", { runId, snapshotDate, rowCounts: ctx!.rowCounts });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[Backup] failed", { runId, message });
      if (ctx) {
        await persistRowCounts(backupPool, runId!, ctx.rowCounts).catch(() => undefined);
      }
      await finishRun(backupPool, runId, "failed", message);
      throw err;
    } finally {
      clearInterval(heartbeatTimer);
    }
  } finally {
    await releaseBackupAdvisoryLock(backupClient).catch(() => undefined);
    backupClient.release();
    await prodPool.end();
    await backupPool.end();
  }
}
