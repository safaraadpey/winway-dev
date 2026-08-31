import type { PoolClient } from "pg";
import type { RunContext } from "./types.js";
import { sourceRowHash } from "./hash.js";
import { sanitizeRow } from "./sanitize.js";
import {
  bumpInserted,
  bumpRead,
  bumpSkipped,
  loadWatermark,
  saveWatermark,
} from "./runControl.js";

export type ImmutableSourceDef = {
  sourceKey: string;
  tableKey: string;
  idColumn: string;
  createdAtColumn: string;
  archiveTable: string;
  selectColumns: string;
  buildInsert: (
    row: Record<string, unknown>,
    sanitized: Record<string, unknown>,
    runId: string
  ) => { sql: string; values: unknown[] };
};

export async function copyImmutableSource(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient,
  def: ImmutableSourceDef
): Promise<void> {
  const wm = await loadWatermark(backup, def.sourceKey);
  let cursorCreatedAt = wm.lastCreatedAt;
  let cursorId = wm.lastId;
  let totalInserted = 0;

  for (;;) {
    const params: unknown[] = [ctx.readAsOf];
    let cursorSql = "";

    if (cursorCreatedAt && cursorId) {
      params.push(cursorCreatedAt, cursorId);
      cursorSql = `AND (${def.createdAtColumn}, ${def.idColumn}::text) > ($2, $3)`;
    } else if (cursorCreatedAt) {
      params.push(cursorCreatedAt);
      cursorSql = `AND ${def.createdAtColumn} > $2`;
    }

    params.push(ctx.batchSize);

    const { rows } = await prod.query<Record<string, unknown>>(
      `SELECT ${def.selectColumns}
       FROM ${def.tableKey}
       WHERE ${def.createdAtColumn} <= $1
       ${cursorSql}
       ORDER BY ${def.createdAtColumn}, ${def.idColumn}
       LIMIT $${params.length}`,
      params
    );

    if (rows.length === 0) break;

    bumpRead(ctx, def.sourceKey, rows.length);

    let batchInserted = 0;
    for (const row of rows) {
      const sanitized = sanitizeRow(def.tableKey, row);
      const { sql, values } = def.buildInsert(row, sanitized, ctx.runId);
      const result = await backup.query(sql, values);
      if ((result.rowCount ?? 0) > 0) {
        batchInserted += 1;
        bumpInserted(ctx, def.sourceKey, 1);
      } else {
        bumpSkipped(ctx, def.sourceKey, 1);
      }
    }

    totalInserted += batchInserted;
    const last = rows[rows.length - 1]!;
    cursorCreatedAt = last[def.createdAtColumn] as Date;
    cursorId = String(last[def.idColumn]);

    await saveWatermark(
      backup,
      ctx.runId,
      def.sourceKey,
      {
        lastCreatedAt: cursorCreatedAt,
        lastId: cursorId,
        lastSourceUpdatedAt: wm.lastSourceUpdatedAt,
      },
      batchInserted
    );
  }
}

export type VersionedSourceDef = {
  sourceKey: string;
  tableKey: string;
  idColumn: string;
  createdAtColumn: string;
  updatedAtColumn: string;
  archiveTable: string;
  latestHashQuery: string;
  selectColumns: string;
  buildInsert: (
    row: Record<string, unknown>,
    sanitized: Record<string, unknown>,
    hash: string,
    runId: string
  ) => { sql: string; values: unknown[] };
};

export async function copyVersionedSource(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient,
  def: VersionedSourceDef
): Promise<void> {
  const wm = await loadWatermark(backup, def.sourceKey);
  let cursorUpdatedAt = wm.lastSourceUpdatedAt ?? wm.lastCreatedAt;
  let cursorId = wm.lastId;

  for (;;) {
    const params: unknown[] = [ctx.readAsOf];
    let cursorSql = "";

    if (cursorUpdatedAt && cursorId) {
      params.push(cursorUpdatedAt, cursorId);
      cursorSql = `AND (${def.updatedAtColumn}, ${def.idColumn}::text) > ($2, $3)`;
    } else if (cursorUpdatedAt) {
      params.push(cursorUpdatedAt);
      cursorSql = `AND ${def.updatedAtColumn} > $2`;
    }

    params.push(ctx.batchSize);

    const { rows } = await prod.query<Record<string, unknown>>(
      `SELECT ${def.selectColumns}
       FROM ${def.tableKey}
       WHERE ${def.updatedAtColumn} <= $1
       ${cursorSql}
       ORDER BY ${def.updatedAtColumn}, ${def.idColumn}
       LIMIT $${params.length}`,
      params
    );

    if (rows.length === 0) break;

    bumpRead(ctx, def.sourceKey, rows.length);

    let batchInserted = 0;
    for (const row of rows) {
      const sanitized = sanitizeRow(def.tableKey, row);
      const hash = sourceRowHash(sanitized);
      const sourceId = String(row[def.idColumn]);

      const { rows: latestRows } = await backup.query<{ source_row_hash: string }>(
        def.latestHashQuery,
        [sourceId]
      );
      const latestHash = latestRows[0]?.source_row_hash;
      if (latestHash === hash) {
        bumpSkipped(ctx, def.sourceKey, 1);
        continue;
      }

      const { sql, values } = def.buildInsert(row, sanitized, hash, ctx.runId);
      const result = await backup.query(sql, values);
      if ((result.rowCount ?? 0) > 0) {
        batchInserted += 1;
        bumpInserted(ctx, def.sourceKey, 1);
      } else {
        bumpSkipped(ctx, def.sourceKey, 1);
      }
    }

    const last = rows[rows.length - 1]!;
    cursorUpdatedAt = last[def.updatedAtColumn] as Date;
    cursorId = String(last[def.idColumn]);

    await saveWatermark(
      backup,
      ctx.runId,
      def.sourceKey,
      {
        lastCreatedAt: wm.lastCreatedAt,
        lastId: cursorId,
        lastSourceUpdatedAt: cursorUpdatedAt,
      },
      batchInserted
    );
  }
}

export async function copyFullSnapshot(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient,
  def: {
    sourceKey: string;
    tableKey: string;
    selectSql: string;
    insertSql: string;
    mapRow: (row: Record<string, unknown>) => unknown[];
  }
): Promise<void> {
  const { rows } = await prod.query<Record<string, unknown>>(def.selectSql);
  bumpRead(ctx, def.sourceKey, rows.length);

  let inserted = 0;
  for (const row of rows) {
    const values = def.mapRow(row);
    const result = await backup.query(def.insertSql, values);
    if ((result.rowCount ?? 0) > 0) inserted += 1;
  }

  bumpInserted(ctx, def.sourceKey, inserted);
  bumpSkipped(ctx, def.sourceKey, rows.length - inserted);
}
