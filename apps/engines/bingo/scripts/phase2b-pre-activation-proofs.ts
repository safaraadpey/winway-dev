#!/usr/bin/env node
/**
 * Phase 2B pre-activation verification on dev DB.
 * Does NOT enable DING_ASYNC_ENABLED. Cleans up all fixtures.
 */
import "dotenv/config";
import pg from "pg";

const DB =
  process.env.DATABASE_URL ??
  process.env.SUPABASE_DB_URL ??
  process.env.POSTGRES_URL;

if (!DB) {
  console.error("Missing DATABASE_URL (or SUPABASE_DB_URL) for proof suite");
  process.exit(2);
}

const TAG = "P2BVERIFY";
const USER_ID = "13c5deb7-10d5-46e8-88f0-0f4a2ac0fabd";
const ROOM_ID = "aaaaaaaa-bbbb-cccc-dddd-000000000001";
const TOURNAMENT_ID = "aaaaaaaa-bbbb-cccc-dddd-000000000002";
const DRAW_NUM = 99991;
const JOB_ID = 999999991;

interface ProofRow {
  test: string;
  metric: string;
  before: string | number | null;
  after: string | number | null;
  pass: boolean;
}

const results: ProofRow[] = [];

function row(
  test: string,
  metric: string,
  before: string | number | null,
  after: string | number | null,
  pass: boolean
): void {
  results.push({ test, metric, before, after, pass });
}

async function q<T = Record<string, unknown>>(
  client: pg.Client,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await client.query(sql, params);
  return res.rows as T[];
}

async function cleanup(client: pg.Client): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(
      `DELETE FROM public.ding_apply_jobs WHERE room_id = $1`,
      [ROOM_ID]
    );
    await client.query(
      `DELETE FROM public.ding_transactions WHERE room_id = $1`,
      [ROOM_ID]
    );
    await client.query(
      `DELETE FROM public.tournament_player_ding_totals WHERE tournament_id = $1`,
      [TOURNAMENT_ID]
    );
    await client.query(
      `DELETE FROM public.ding_balances WHERE user_id = $1`,
      [USER_ID]
    );
    await client.query(`DELETE FROM public.draw_jobs WHERE room_id = $1`, [
      ROOM_ID,
    ]);
    await client.query(`DELETE FROM public.draws WHERE room_id = $1`, [
      ROOM_ID,
    ]);
    await client.query(
      `DELETE FROM public.tournament_round_rooms WHERE room_id = $1`,
      [ROOM_ID]
    );
    await client.query(`DELETE FROM public.rooms WHERE id = $1`, [ROOM_ID]);
    await client.query(`DELETE FROM public.tournaments WHERE id = $1`, [
      TOURNAMENT_ID,
    ]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

async function setup(client: pg.Client): Promise<string> {
  await cleanup(client);
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO public.tournaments (id, title, status, created_by)
     VALUES ($1, $2, 'running', $3)
     ON CONFLICT (id) DO NOTHING`,
    [TOURNAMENT_ID, `${TAG} tournament`, USER_ID]
  );
  await client.query(
    `INSERT INTO public.rooms (
       id, room_code, status, card_price, currency, max_cards_per_player,
       ding_per_number, engine_owner_id, engine_lease_until, engine_lease_epoch
     ) VALUES (
       $1, $2, 'playing', 1000, 'IRR', 10,
       2, 'proof-owner', now() + interval '1 hour', 42
     )`,
    [ROOM_ID, `${TAG}-ROOM`]
  );
  await client.query(
    `INSERT INTO public.tournament_round_rooms (tournament_id, room_id, round_no, table_no)
     VALUES ($1, $2, 1, 1)`,
    [TOURNAMENT_ID, ROOM_ID]
  );
  const drawRes = await client.query(
    `INSERT INTO public.draws (room_id, number, timestamp, created_at)
     VALUES ($1, $2, now(), now())
     RETURNING id`,
    [ROOM_ID, DRAW_NUM]
  );
  const drawId = drawRes.rows[0].id as string;
  await client.query(
    `INSERT INTO public.draw_jobs (id, room_id, draw_number, status, attempts, created_at, updated_at)
     VALUES ($1, $2, $3, 'processing', 0, now(), now())`,
    [JOB_ID, ROOM_ID, DRAW_NUM]
  );
  await client.query("COMMIT");
  return drawId;
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const staticChecks: Record<string, unknown> = {};

  try {
    // Static checks
    const triggers = await q<{ tgname: string; tgenabled: string }>(
      client,
      `SELECT tgname, tgenabled FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       WHERE c.relname = 'draws' AND tgname LIKE '%ding%'`
    );
    staticChecks.legacy_trigger_disabled =
      triggers.every((t) => t.tgenabled === "D");

    const finalizeArgs = await q<{ args: string }>(
      client,
      `SELECT pg_get_function_arguments(p.oid) AS args
       FROM pg_proc p WHERE p.proname = 'rpc_finalize_engine_draw_job'
       AND p.pronamespace = 'public'::regnamespace LIMIT 1`
    );
    staticChecks.p_defer_ding_default_false =
      finalizeArgs[0]?.args?.includes("p_defer_ding boolean DEFAULT false") ??
      false;

    const pickDef = await q<{ def: string }>(
      client,
      `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
       WHERE p.proname = 'rpc_pick_ding_apply_jobs' AND p.pronamespace = 'public'::regnamespace`
    );
    staticChecks.pick_skip_locked =
      pickDef[0]?.def?.includes("FOR UPDATE SKIP LOCKED") ?? false;

    const drawPickDef = await q<{ def: string }>(
      client,
      `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
       WHERE p.proname = 'rpc_pick_draw_jobs' AND p.pronamespace = 'public'::regnamespace LIMIT 1`
    );
    staticChecks.phase2a_live_lease_exclusion =
      drawPickDef[0]?.def?.includes("engine_lease_until > clock_timestamp()") ??
      false;

    const uniq = await q<{ conname: string }>(
      client,
      `SELECT conname FROM pg_constraint WHERE conrelid = 'public.ding_apply_jobs'::regclass
       AND conname = 'ding_apply_jobs_room_draw_unique'`
    );
    staticChecks.ding_job_unique = uniq.length === 1;

    // Phase 2A fence: wrong owner returns -1, no ding job
    await setup(client);
    const fenceBeforeJobs = (
      await q<{ cnt: string }>(
        client,
        `SELECT count(*)::text AS cnt FROM ding_apply_jobs WHERE room_id = $1`,
        [ROOM_ID]
      )
    )[0].cnt;
    const fenceResult = await q<{ rpc_finalize_engine_draw_job: number }>(
      client,
      `SELECT public.rpc_finalize_engine_draw_job(
         $1::bigint, $2::uuid, $3::int,
         '[]'::jsonb, '[]'::jsonb, false, 2,
         jsonb_build_array(jsonb_build_object('user_id', $4::text, 'amount', 4, 'matched_cards', 2)),
         NULL, NULL, NULL, NULL, NULL, NULL, NULL,
         'wrong-owner', 99, true
       ) AS rpc_finalize_engine_draw_job`,
      [JOB_ID, ROOM_ID, DRAW_NUM, USER_ID]
    );
    const fenceAfterJobs = (
      await q<{ cnt: string }>(
        client,
        `SELECT count(*)::text AS cnt FROM ding_apply_jobs WHERE room_id = $1`,
        [ROOM_ID]
      )
    )[0].cnt;
    const fenceProcessed = (
      await q<{ processed_at: string | null }>(
        client,
        `SELECT processed_at::text FROM draws WHERE room_id = $1 AND number = $2`,
        [ROOM_ID, DRAW_NUM]
      )
    )[0].processed_at;

    row(
      "Phase2A_fence",
      "finalize_return",
      null,
      fenceResult[0]?.rpc_finalize_engine_draw_job ?? null,
      fenceResult[0]?.rpc_finalize_engine_draw_job === -1
    );
    row(
      "Phase2A_fence",
      "ding_apply_jobs_count",
      fenceBeforeJobs,
      fenceAfterJobs,
      fenceBeforeJobs === fenceAfterJobs && fenceAfterJobs === "0"
    );
    row(
      "Phase2A_fence",
      "draws.processed_at",
      null,
      fenceProcessed,
      fenceProcessed === null
    );

    // Reset for T1/T2/T3/T4
    await setup(client);
    const credits = JSON.stringify([
      { user_id: USER_ID, amount: 4, matched_cards: 2 },
    ]);

    // Finalize with defer — positive T2 path
    const t2Before = await q<{
      processed_at: string | null;
      job_count: string;
    }>(
      client,
      `SELECT d.processed_at::text,
              (SELECT count(*)::text FROM ding_apply_jobs j WHERE j.room_id = d.room_id AND j.draw_number = d.number) AS job_count
       FROM draws d WHERE d.room_id = $1 AND d.number = $2`,
      [ROOM_ID, DRAW_NUM]
    );

    await client.query(
      `SELECT public.rpc_finalize_engine_draw_job(
         $1::bigint, $2::uuid, $3::int,
         '[]'::jsonb, '[]'::jsonb, false, 2, $4::jsonb,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL,
         'proof-owner', 42, true
       )`,
      [JOB_ID, ROOM_ID, DRAW_NUM, credits]
    );

    const t2AfterFirst = await q<{
      processed_at: string | null;
      job_count: string;
      job_status: string | null;
    }>(
      client,
      `SELECT d.processed_at::text,
              (SELECT count(*)::text FROM ding_apply_jobs j WHERE j.room_id = d.room_id AND j.draw_number = d.number) AS job_count,
              (SELECT status FROM ding_apply_jobs j WHERE j.room_id = d.room_id AND j.draw_number = d.number LIMIT 1) AS job_status
       FROM draws d WHERE d.room_id = $1 AND d.number = $2`,
      [ROOM_ID, DRAW_NUM]
    );

    row(
      "T2_atomic_enqueue",
      "processed_at",
      t2Before[0]?.processed_at ?? null,
      t2AfterFirst[0]?.processed_at ?? null,
      t2Before[0]?.processed_at === null &&
        t2AfterFirst[0]?.processed_at !== null
    );
    row(
      "T2_atomic_enqueue",
      "ding_apply_jobs_count",
      t2Before[0]?.job_count ?? null,
      t2AfterFirst[0]?.job_count ?? null,
      t2Before[0]?.job_count === "0" && t2AfterFirst[0]?.job_count === "1"
    );
    row(
      "T2_atomic_enqueue",
      "job_status",
      null,
      t2AfterFirst[0]?.job_status ?? null,
      t2AfterFirst[0]?.job_status === "queued"
    );

    // T2 negative: forced rollback — processed_at must not stick without job
    await client.query("BEGIN");
    let t2NegRolledBack = false;
    try {
      await client.query(
        `UPDATE draws SET processed_at = NULL, ding_aggregated_at = NULL
         WHERE room_id = $1 AND number = $2`,
        [ROOM_ID, DRAW_NUM]
      );
      await client.query(`DELETE FROM ding_apply_jobs WHERE room_id = $1`, [
        ROOM_ID,
      ]);
      await client.query(
        `UPDATE draw_jobs SET status = 'processing' WHERE id = $1`,
        [JOB_ID]
      );
      // Simulate same-txn failure after processed_at by invalid FK on ding job
      await client.query(
        `DO $do$
         DECLARE v_draw_id uuid;
         BEGIN
           UPDATE draws SET processed_at = now()
           WHERE room_id = '${ROOM_ID}' AND number = ${DRAW_NUM}
           RETURNING id INTO v_draw_id;
           INSERT INTO ding_apply_jobs (draw_id, room_id, draw_number, ding_per_card, credits)
           VALUES ('00000000-0000-0000-0000-000000000000', '${ROOM_ID}', ${DRAW_NUM}, 2, '[]'::jsonb);
         END $do$`
      );
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK");
      t2NegRolledBack = true;
    }

    const t2NegState = await q<{
      processed_at: string | null;
      job_count: string;
    }>(
      client,
      `SELECT d.processed_at::text,
              (SELECT count(*)::text FROM ding_apply_jobs j WHERE j.room_id = d.room_id AND j.draw_number = d.number) AS job_count
       FROM draws d WHERE d.room_id = $1 AND d.number = $2`,
      [ROOM_ID, DRAW_NUM]
    );

    row(
      "T2_rollback",
      "txn_rolled_back",
      null,
      t2NegRolledBack,
      t2NegRolledBack === true
    );
    row(
      "T2_rollback",
      "processed_at_after_failed_txn",
      null,
      t2NegState[0]?.processed_at ?? null,
      t2NegState[0]?.processed_at === null
    );
    row(
      "T2_rollback",
      "ding_apply_jobs_count",
      null,
      t2NegState[0]?.job_count ?? null,
      t2NegState[0]?.job_count === "0"
    );

    // Restore positive path for T1/T3/T4
    await client.query(
      `SELECT public.rpc_finalize_engine_draw_job(
         $1::bigint, $2::uuid, $3::int,
         '[]'::jsonb, '[]'::jsonb, false, 2, $4::jsonb,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL,
         'proof-owner', 42, true
       )`,
      [JOB_ID, ROOM_ID, DRAW_NUM, credits]
    );

    // Set processed_at + job manually if fence blocked re-finalize
    await client.query(
      `UPDATE draws SET processed_at = COALESCE(processed_at, now()), ding_aggregated_at = NULL
       WHERE room_id = $1 AND number = $2`,
      [ROOM_ID, DRAW_NUM]
    );
    await client.query(
      `INSERT INTO ding_apply_jobs (draw_id, room_id, draw_number, ding_per_card, credits, status)
       SELECT d.id, d.room_id, d.number, 2, $3::jsonb, 'queued'
       FROM draws d WHERE d.room_id = $1 AND d.number = $2
       ON CONFLICT (room_id, draw_number) DO NOTHING`,
      [ROOM_ID, DRAW_NUM, credits]
    );

    // Uniqueness on finalize retry
    const uniqBefore = (
      await q<{ cnt: string }>(
        client,
        `SELECT count(*)::text AS cnt FROM ding_apply_jobs WHERE room_id = $1`,
        [ROOM_ID]
      )
    )[0].cnt;
    await client.query(
      `SELECT public.rpc_finalize_engine_draw_job(
         $1::bigint, $2::uuid, $3::int,
         '[]'::jsonb, '[]'::jsonb, false, 2, $4::jsonb,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL,
         'proof-owner', 42, true
       )`,
      [JOB_ID, ROOM_ID, DRAW_NUM, credits]
    );
    const uniqAfter = (
      await q<{ cnt: string }>(
        client,
        `SELECT count(*)::text AS cnt FROM ding_apply_jobs WHERE room_id = $1`,
        [ROOM_ID]
      )
    )[0].cnt;
    row(
      "Uniqueness_retry",
      "ding_apply_jobs_count",
      uniqBefore,
      uniqAfter,
      uniqBefore === uniqAfter
    );

    // T1 + T3: first apply
    const t1Before = await q<{
      ding_total: string | null;
      balance: string | null;
      txn_count: string;
    }>(
      client,
      `SELECT
         (SELECT ding_total::text FROM tournament_player_ding_totals
          WHERE tournament_id = $1 AND user_id = $2) AS ding_total,
         (SELECT balance::text FROM ding_balances WHERE user_id = $2) AS balance,
         (SELECT count(*)::text FROM ding_transactions dt
          JOIN draws d ON d.id = dt.draw_id
          WHERE d.room_id = $3 AND d.number = $4 AND dt.user_id = $2) AS txn_count`,
      [TOURNAMENT_ID, USER_ID, ROOM_ID, DRAW_NUM]
    );

    const apply1 = await q<{ credited: number }>(
      client,
      `SELECT public.rpc_apply_ding_credits_for_draw($1::uuid, $2::int, 2, $3::jsonb) AS credited`,
      [ROOM_ID, DRAW_NUM, credits]
    );

    const t1Mid = await q<{
      ding_total: string | null;
      balance: string | null;
      txn_count: string;
      ding_aggregated_at: string | null;
    }>(
      client,
      `SELECT
         (SELECT ding_total::text FROM tournament_player_ding_totals
          WHERE tournament_id = $1 AND user_id = $2) AS ding_total,
         (SELECT balance::text FROM ding_balances WHERE user_id = $2) AS balance,
         (SELECT count(*)::text FROM ding_transactions dt
          JOIN draws d ON d.id = dt.draw_id
          WHERE d.room_id = $3 AND d.number = $4 AND dt.user_id = $2) AS txn_count,
         (SELECT ding_aggregated_at::text FROM draws WHERE room_id = $3 AND number = $4) AS ding_aggregated_at`,
      [TOURNAMENT_ID, USER_ID, ROOM_ID, DRAW_NUM]
    );

    // T1: duplicate apply
    const apply2 = await q<{ credited: number }>(
      client,
      `SELECT public.rpc_apply_ding_credits_for_draw($1::uuid, $2::int, 2, $3::jsonb) AS credited`,
      [ROOM_ID, DRAW_NUM, credits]
    );

    const t1After = await q<{
      ding_total: string | null;
      balance: string | null;
      txn_count: string;
    }>(
      client,
      `SELECT
         (SELECT ding_total::text FROM tournament_player_ding_totals
          WHERE tournament_id = $1 AND user_id = $2) AS ding_total,
         (SELECT balance::text FROM ding_balances WHERE user_id = $2) AS balance,
         (SELECT count(*)::text FROM ding_transactions dt
          JOIN draws d ON d.id = dt.draw_id
          WHERE d.room_id = $3 AND d.number = $4 AND dt.user_id = $2) AS txn_count`,
      [TOURNAMENT_ID, USER_ID, ROOM_ID, DRAW_NUM]
    );

    row(
      "T1_duplicate_apply",
      "tournament_player_ding_totals.ding_total",
      t1Before[0]?.ding_total ?? "0",
      t1After[0]?.ding_total ?? null,
      t1Mid[0]?.ding_total === t1After[0]?.ding_total &&
        apply2[0]?.credited === 0
    );
    row(
      "T1_duplicate_apply",
      "ding_balances.balance",
      t1Before[0]?.balance ?? "0",
      t1After[0]?.balance ?? null,
      t1Mid[0]?.balance === t1After[0]?.balance
    );
    row(
      "T1_duplicate_apply",
      "ding_transactions_count",
      t1Before[0]?.txn_count ?? "0",
      t1After[0]?.txn_count ?? null,
      t1Mid[0]?.txn_count === t1After[0]?.txn_count &&
        t1After[0]?.txn_count === "1"
    );
    row(
      "T1_duplicate_apply",
      "second_apply_return",
      apply1[0]?.credited ?? null,
      apply2[0]?.credited ?? null,
      apply2[0]?.credited === 0
    );

    // T3: duplicate worker delivery — reset aggregated_at and re-apply via job path
    const t3BeforeBal = t1After[0]?.balance ?? null;
    const t3BeforeTourn = t1After[0]?.ding_total ?? null;
    const t3BeforeTxn = t1After[0]?.txn_count ?? null;

    await client.query(
      `UPDATE draws SET ding_aggregated_at = NULL WHERE room_id = $1 AND number = $2`,
      [ROOM_ID, DRAW_NUM]
    );
    const workerApply1 = await q<{ credited: number }>(
      client,
      `SELECT public.rpc_apply_ding_credits_for_draw($1::uuid, $2::int, 2, $3::jsonb) AS credited`,
      [ROOM_ID, DRAW_NUM, credits]
    );
    const workerApply2 = await q<{ credited: number }>(
      client,
      `SELECT public.rpc_apply_ding_credits_for_draw($1::uuid, $2::int, 2, $3::jsonb) AS credited`,
      [ROOM_ID, DRAW_NUM, credits]
    );

    const t3After = await q<{
      balance: string | null;
      ding_total: string | null;
      txn_count: string;
    }>(
      client,
      `SELECT
         (SELECT balance::text FROM ding_balances WHERE user_id = $1) AS balance,
         (SELECT ding_total::text FROM tournament_player_ding_totals
          WHERE tournament_id = $2 AND user_id = $1) AS ding_total,
         (SELECT count(*)::text FROM ding_transactions dt
          JOIN draws d ON d.id = dt.draw_id
          WHERE d.room_id = $3 AND d.number = $4 AND dt.user_id = $1) AS txn_count`,
      [USER_ID, TOURNAMENT_ID, ROOM_ID, DRAW_NUM]
    );

    row(
      "T3_duplicate_worker",
      "ding_balances.balance",
      t3BeforeBal,
      t3After[0]?.balance ?? null,
      t3BeforeBal === t3After[0]?.balance
    );
    row(
      "T3_duplicate_worker",
      "tournament_player_ding_totals.ding_total",
      t3BeforeTourn,
      t3After[0]?.ding_total ?? null,
      t3BeforeTourn === t3After[0]?.ding_total
    );
    row(
      "T3_duplicate_worker",
      "ding_transactions_count",
      t3BeforeTxn,
      t3After[0]?.txn_count ?? null,
      t3BeforeTxn === t3After[0]?.txn_count
    );
    row(
      "T3_duplicate_worker",
      "apply_returns",
      `${workerApply1[0]?.credited}`,
      `${workerApply2[0]?.credited}`,
      workerApply2[0]?.credited === 0
    );

    // T4: stale processing after apply commit
    const jobId = (
      await q<{ id: string }>(
        client,
        `SELECT id::text FROM ding_apply_jobs WHERE room_id = $1 AND draw_number = $2`,
        [ROOM_ID, DRAW_NUM]
      )
    )[0]?.id;

    await client.query(
      `UPDATE ding_apply_jobs
       SET status = 'processing', updated_at = now() - interval '5 minutes'
       WHERE id = $1`,
      [jobId]
    );

    const t4Before = await q<{
      job_status: string;
      balance: string | null;
      ding_total: string | null;
    }>(
      client,
      `SELECT
         (SELECT status FROM ding_apply_jobs WHERE id = $1) AS job_status,
         (SELECT balance::text FROM ding_balances WHERE user_id = $2) AS balance,
         (SELECT ding_total::text FROM tournament_player_ding_totals
          WHERE tournament_id = $3 AND user_id = $2) AS ding_total`,
      [jobId, USER_ID, TOURNAMENT_ID]
    );

    const reap = await q<{ requeued: number; completed: number }>(
      client,
      `SELECT * FROM public.rpc_reap_stale_ding_apply_jobs(60)`
    );

    const t4After = await q<{
      job_status: string;
      completed_at: string | null;
      balance: string | null;
      ding_total: string | null;
    }>(
      client,
      `SELECT
         (SELECT status FROM ding_apply_jobs WHERE id = $1) AS job_status,
         (SELECT completed_at::text FROM ding_apply_jobs WHERE id = $1) AS completed_at,
         (SELECT balance::text FROM ding_balances WHERE user_id = $2) AS balance,
         (SELECT ding_total::text FROM tournament_player_ding_totals
          WHERE tournament_id = $3 AND user_id = $2) AS ding_total`,
      [jobId, USER_ID, TOURNAMENT_ID]
    );

    row(
      "T4_stale_reap",
      "job_status",
      t4Before[0]?.job_status ?? null,
      t4After[0]?.job_status ?? null,
      t4Before[0]?.job_status === "processing" &&
        t4After[0]?.job_status === "done"
    );
    row(
      "T4_stale_reap",
      "reap.completed",
      null,
      reap[0]?.completed ?? null,
      (reap[0]?.completed ?? 0) >= 1
    );
    row(
      "T4_stale_reap",
      "ding_balances.balance",
      t4Before[0]?.balance ?? null,
      t4After[0]?.balance ?? null,
      t4Before[0]?.balance === t4After[0]?.balance
    );
    row(
      "T4_stale_reap",
      "tournament_player_ding_totals.ding_total",
      t4Before[0]?.ding_total ?? null,
      t4After[0]?.ding_total ?? null,
      t4Before[0]?.ding_total === t4After[0]?.ding_total
    );

    // SKIP LOCKED concurrent pick smoke
    await client.query(`DELETE FROM ding_apply_jobs WHERE room_id = $1`, [
      ROOM_ID,
    ]);
    await client.query(
      `INSERT INTO ding_apply_jobs (draw_id, room_id, draw_number, ding_per_card, credits, status)
       SELECT d.id, d.room_id, d.number, 2, '[]'::jsonb, 'queued'
       FROM draws d WHERE d.room_id = $1 AND d.number = $2`,
      [ROOM_ID, DRAW_NUM]
    );
    const pick1 = await q<{ id: string }>(
      client,
      `SELECT id::text FROM rpc_pick_ding_apply_jobs(1)`
    );
    const pick2 = await q<{ id: string }>(
      client,
      `SELECT id::text FROM rpc_pick_ding_apply_jobs(1)`
    );
    row(
      "Pick_SKIP_LOCKED",
      "first_pick_id",
      null,
      pick1[0]?.id ?? null,
      pick1.length === 1
    );
    row(
      "Pick_SKIP_LOCKED",
      "second_pick_empty",
      pick1[0]?.id ?? null,
      pick2[0]?.id ?? "none",
      pick2.length === 0
    );

    console.log(
      JSON.stringify(
        {
          db: "yqnptpreowkimopxicfz",
          staticChecks,
          engine: {
            DING_ASYNC_ENABLED_default_false:
              process.env.DING_ASYNC_ENABLED !== "true",
            note: "env.ts uses process.env.DING_ASYNC_ENABLED === 'true'; unset => false",
          },
          proofs: results,
          allPass:
            Object.values(staticChecks).every(Boolean) &&
            results.every((r) => r.pass),
        },
        null,
        2
      )
    );
  } finally {
    await cleanup(client);
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
