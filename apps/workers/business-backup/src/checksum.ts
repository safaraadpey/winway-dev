import type { Pool, PoolClient } from "pg";
import type { ChecksumResult, RunContext } from "./types.js";

export async function verifyChecksums(
  ctx: RunContext,
  prod: PoolClient
): Promise<ChecksumResult> {
  const errors: string[] = [];
  const details: Record<string, unknown> = {};

  const walletProd = await prod.query<{
    cnt: string;
    sum_balance: string;
    sum_locked: string;
  }>(
    `SELECT count(*)::text AS cnt,
            coalesce(sum(balance),0)::text AS sum_balance,
            coalesce(sum(locked_amount),0)::text AS sum_locked
     FROM public.wallets`
  );
  const walletBackup = await ctx.backupPool.query<{
    cnt: string;
    sum_balance: string;
    sum_locked: string;
  }>(
    `SELECT count(*)::text AS cnt,
            coalesce(sum(balance),0)::text AS sum_balance,
            coalesce(sum(locked_amount),0)::text AS sum_locked
     FROM archive.state_wallets WHERE snapshot_date = $1`,
    [ctx.snapshotDate]
  );

  details.wallets = {
    prod: walletProd.rows[0],
    backup: walletBackup.rows[0],
  };
  if (
    walletProd.rows[0]?.cnt !== walletBackup.rows[0]?.cnt ||
    walletProd.rows[0]?.sum_balance !== walletBackup.rows[0]?.sum_balance
  ) {
    errors.push("wallet snapshot mismatch");
  }

  const dingProd = await prod.query<{
    cnt: string;
    sum_balance: string;
  }>(
    `SELECT count(*)::text AS cnt, coalesce(sum(balance),0)::text AS sum_balance
     FROM public.ding_balances`
  );
  const dingBackup = await ctx.backupPool.query<{
    cnt: string;
    sum_balance: string;
  }>(
    `SELECT count(*)::text AS cnt, coalesce(sum(balance),0)::text AS sum_balance
     FROM archive.state_ding_balances WHERE snapshot_date = $1`,
    [ctx.snapshotDate]
  );
  details.ding_balances = { prod: dingProd.rows[0], backup: dingBackup.rows[0] };
  if (dingProd.rows[0]?.cnt !== dingBackup.rows[0]?.cnt) {
    errors.push("ding_balances snapshot count mismatch");
  }

  const txProd = await prod.query<{ max_created: Date | null }>(
    `SELECT max(created_at) AS max_created FROM public.transactions WHERE created_at <= $1`,
    [ctx.readAsOf]
  );
  const txBackup = await ctx.backupPool.query<{ max_created: Date | null }>(
    `SELECT max(source_created_at) AS max_created FROM archive.ledger_transactions`
  );
  details.transactions_max_created = {
    prod: txProd.rows[0]?.max_created,
    backup: txBackup.rows[0]?.max_created,
  };

  const dingTxProd = await prod.query<{ max_created: Date | null }>(
    `SELECT max(created_at) AS max_created FROM public.ding_transactions WHERE created_at <= $1`,
    [ctx.readAsOf]
  );
  const dingTxBackup = await ctx.backupPool.query<{ max_created: Date | null }>(
    `SELECT max(source_created_at) AS max_created FROM archive.ledger_ding_transactions`
  );
  details.ding_transactions_max_created = {
    prod: dingTxProd.rows[0]?.max_created,
    backup: dingTxBackup.rows[0]?.max_created,
  };

  const { rows: roomsThisRun } = await ctx.backupPool.query<{ room_id: string; draw_count: number }>(
    `SELECT room_id, draw_count FROM archive.game_room_draws WHERE first_run_id = $1`,
    [ctx.runId]
  );

  const drawMismatchSample: string[] = [];
  for (const room of roomsThisRun) {
    const { rows: prodCount } = await prod.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM public.draws WHERE room_id = $1`,
      [room.room_id]
    );
    if (prodCount[0]?.cnt !== String(room.draw_count)) {
      drawMismatchSample.push(room.room_id);
    }
  }

  if (drawMismatchSample.length > 0) {
    errors.push(`draw sequence mismatch for ${drawMismatchSample.length} rooms`);
    details.draw_mismatches = drawMismatchSample.slice(0, 10);
  }

  return { ok: errors.length === 0, details, errors };
}

export async function saveChecksumResult(
  pool: Pool,
  runId: string,
  result: ChecksumResult
): Promise<void> {
  await pool.query(
    `UPDATE archive.snapshot_runs SET checksums = $2::jsonb WHERE run_id = $1`,
    [
      runId,
      JSON.stringify({
        ok: result.ok,
        details: result.details,
        errors: result.errors,
        verified_at: new Date().toISOString(),
      }),
    ]
  );
}
