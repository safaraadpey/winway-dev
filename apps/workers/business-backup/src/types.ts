import type { Pool, PoolClient } from "pg";

export type RunStatus = "running" | "succeeded" | "failed";

export type SourceCounts = {
  read: number;
  inserted: number;
  skipped_existing: number;
};

export type RunContext = {
  runId: string;
  snapshotDate: string;
  readAsOf: Date;
  prodPool: Pool;
  backupPool: Pool;
  rowCounts: Record<string, SourceCounts>;
  batchSize: number;
};

export type DbClients = {
  prod: PoolClient;
  backup: PoolClient;
};

export type ChecksumResult = {
  ok: boolean;
  details: Record<string, unknown>;
  errors: string[];
};
