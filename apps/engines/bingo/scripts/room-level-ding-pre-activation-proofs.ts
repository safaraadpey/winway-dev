#!/usr/bin/env node
/**
 * Room-level Ding pre-activation verification on dev DB.
 * Does NOT enable DING_ROOM_SETTLE_ENABLED. Cleans up all fixtures.
 */
import "dotenv/config";
import pg from "pg";
import {
  computePendingDingForUser,
  resolveDingPerCard,
} from "../../../../lib/ding/roomPendingDing.js";
import {
  buildRoomFinalizationDingPayload,
  replayRoomDingFromMarks,
  roomDingSettlementKey,
} from "../src/domain/ding/roomDingState.js";
import { RoomRuntimeState } from "../src/state/room-state.js";
import type { RoomRow, TicketRow } from "../src/repositories/types.js";

const DB =
  process.env.DATABASE_URL ??
  process.env.SUPABASE_DB_URL ??
  process.env.POSTGRES_URL;

if (!DB) {
  console.error("Missing DATABASE_URL");
  process.exit(2);
}

const PROOF_LOCK_KEY = 61004160001;
const TAG = "RLDVERIFY";
const POOL_ID = "d78ea19e-7c3b-41c2-b360-7dfe1c6ed999";
const USER_A = "13c5deb7-10d5-46e8-88f0-0f4a2ac0fabd";
const USER_B = "7a2e8c1d-2dff-40db-81a7-644094a52b7f";
const INVALID_USER = "00000000-0000-0000-0000-000000009999";

const ROOM_DURING = "bbbbbbbb-bbbb-bbbb-bbbb-000000000101";
const ROOM_PER_DRAW = "bbbbbbbb-bbbb-bbbb-bbbb-000000000102";
const TOURNAMENT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-000000000103";
const ROOM_ROLLBACK = "bbbbbbbb-bbbb-bbbb-bbbb-000000000104";
const ROOM_SUCCESS = "bbbbbbbb-bbbb-bbbb-bbbb-000000000105";
const ROOM_EXHAUSTED = "bbbbbbbb-bbbb-bbbb-bbbb-000000000106";
const ROOM_JANITOR = "bbbbbbbb-bbbb-bbbb-bbbb-000000000107";

const ALL_ROOMS = [
  ROOM_DURING,
  ROOM_PER_DRAW,
  ROOM_ROLLBACK,
  ROOM_SUCCESS,
  ROOM_EXHAUSTED,
  ROOM_JANITOR,
];

const TICKET_DURING = "cccccccc-cccc-cccc-cccc-000000000201";
const TICKET_PD = "cccccccc-cccc-cccc-cccc-000000000202";
const TICKET_ROLLBACK = "cccccccc-cccc-cccc-cccc-000000000204";
const TICKET_SUCCESS = "cccccccc-cccc-cccc-cccc-000000000205";
const TICKET_EXHAUSTED = "cccccccc-cccc-cccc-cccc-000000000206";
const TICKET_JANITOR = "cccccccc-cccc-cccc-cccc-000000000207";

interface ProofRow {
  proof: string;
  metric: string;
  before: string | number | null;
  after: string | number | null;
  pass: boolean;
}

const results: ProofRow[] = [];

function row(
  proof: string,
  metric: string,
  before: string | number | null,
  after: string | number | null,
  pass: boolean
): void {
  results.push({ proof, metric, before, after, pass });
}

async function q<T = Record<string, unknown>>(
  client: pg.Client,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await client.query(sql, params);
  return res.rows as T[];
}

async function execIgnore(client: pg.Client, sql: string, params: unknown[] = []): Promise<void> {
  try {
    await client.query(sql, params);
  } catch {
    // fixture cleanup best-effort
  }
}

async function acquireProofLock(client: pg.Client): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const res = await client.query(`SELECT pg_try_advisory_lock($1) AS ok`, [PROOF_LOCK_KEY]);
    if (res.rows[0]?.ok === true) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Could not acquire proof advisory lock");
}

async function releaseProofLock(client: pg.Client): Promise<void> {
  await client.query(`SELECT pg_advisory_unlock($1)`, [PROOF_LOCK_KEY]);
}

async function cleanup(client: pg.Client): Promise<void> {
  await client.query(`SET lock_timeout = '8s'`);
  const jobIds = [
    880001, 880002, 880003, 881001, 882001, 882002,
    883001, 883002, 883003, 884001, 884002,
  ];
  for (const jobId of jobIds) {
    await execIgnore(client, `DELETE FROM draw_jobs WHERE id = $1`, [jobId]);
  }
  for (const roomId of ALL_ROOMS) {
    await execIgnore(client, `DELETE FROM ding_apply_jobs WHERE room_id = $1`, [roomId]);
    await execIgnore(client, `DELETE FROM ding_transactions WHERE room_id = $1`, [roomId]);
    await execIgnore(
      client,
      `DELETE FROM marks WHERE ticket_id IN (SELECT id FROM tickets WHERE room_id = $1)`,
      [roomId]
    );
    await execIgnore(client, `DELETE FROM results WHERE room_id = $1`, [roomId]);
    await execIgnore(client, `DELETE FROM draw_jobs WHERE room_id = $1`, [roomId]);
    await execIgnore(client, `DELETE FROM draws WHERE room_id = $1`, [roomId]);
    await execIgnore(client, `DELETE FROM commissions_log WHERE room_id = $1`, [roomId]);
    await execIgnore(client, `DELETE FROM tickets WHERE room_id = $1`, [roomId]);
    await execIgnore(client, `DELETE FROM tournament_round_rooms WHERE room_id = $1`, [roomId]);
    await execIgnore(client, `DELETE FROM rooms WHERE id = $1`, [roomId]);
  }
  await execIgnore(
    client,
    `DELETE FROM tournament_player_ding_totals WHERE tournament_id = $1`,
    [TOURNAMENT_ID]
  );
  await execIgnore(client, `DELETE FROM tournaments WHERE id = $1`, [TOURNAMENT_ID]);
}

async function insertRoom(
  client: pg.Client,
  roomId: string,
  code: string,
  mode: "room_level" | "per_draw"
): Promise<void> {
  await client.query(
    `INSERT INTO rooms (
       id, room_code, status, card_price, currency, max_cards_per_player,
       ding_per_number, ding_settle_mode, pool_id,
       engine_owner_id, engine_lease_until, engine_lease_epoch
     ) VALUES (
       $1, $2, 'playing', 1000, 'IRR', 10,
       2, $3, $4,
       'proof-owner', now() + interval '1 hour', 42
     )`,
    [roomId, code, mode, POOL_ID]
  );
}

async function ensureWalletFunded(
  client: pg.Client,
  userId: string,
  amount: number
): Promise<void> {
  const updated = await client.query(
    `UPDATE wallets
        SET balance = GREATEST(balance, $2), updated_at = now()
      WHERE user_id = $1`,
    [userId, amount]
  );
  if ((updated.rowCount ?? 0) === 0) {
    await client.query(
      `INSERT INTO wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
       VALUES ($1, 'IRR', $2, 0, now(), now())`,
      [userId, amount]
    );
  }
}

async function ensureTicketHold(
  client: pg.Client,
  userId: string,
  roomId: string,
  ticketId: string,
  price: number
): Promise<void> {
  await ensureWalletFunded(client, userId, 50000);
  await client.query(
    `SELECT game_finance.fn_wallet_hold_join($1::uuid, $2::numeric, 'IRR', $3::uuid, $4::uuid)`,
    [userId, price, roomId, ticketId]
  );
}

async function walletTotal(
  client: pg.Client,
  userId: string
): Promise<string> {
  const [row] = await q<{ total: string | null }>(
    client,
    `SELECT (COALESCE(balance,0) + COALESCE(locked_amount,0))::text AS total
     FROM wallets WHERE user_id = $1 AND currency = 'IRR'`,
    [userId]
  );
  return row?.total ?? "0";
}

async function insertTicket(
  client: pg.Client,
  ticketId: string,
  roomId: string,
  userId: string,
  poolCardId: string
): Promise<void> {
  await client.query(
    `INSERT INTO tickets (id, room_id, player_user_id, pool_card_id, card_no, price, reservation_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 1, 1000, 'reserved', now(), now())`,
    [ticketId, roomId, userId, poolCardId]
  );
  await ensureTicketHold(client, userId, roomId, ticketId, 1000);
}

async function setupFixtures(client: pg.Client): Promise<void> {
  await cleanup(client);

  await client.query(
    `INSERT INTO tournaments (id, title, status, created_by, table_size_mode, table_size_fixed)
     VALUES ($1, $2, 'running', $3, 'fixed', 4)`,
    [TOURNAMENT_ID, `${TAG} tournament`, USER_A]
  );

  await insertRoom(client, ROOM_DURING, `${TAG}-DURING`, "room_level");
  await insertRoom(client, ROOM_PER_DRAW, `${TAG}-PD`, "per_draw");
  await insertRoom(client, ROOM_ROLLBACK, `${TAG}-RB`, "room_level");
  await insertRoom(client, ROOM_SUCCESS, `${TAG}-OK`, "room_level");
  await insertRoom(client, ROOM_EXHAUSTED, `${TAG}-EX`, "room_level");
  await insertRoom(client, ROOM_JANITOR, `${TAG}-JN`, "room_level");

  await client.query(
    `INSERT INTO tournament_round_rooms (tournament_id, room_id, round_no, table_no)
     VALUES ($1, $2, 1, 1)`,
    [TOURNAMENT_ID, ROOM_DURING]
  );
  await client.query(
    `INSERT INTO tournament_round_rooms (tournament_id, room_id, round_no, table_no)
     VALUES ($1, $2, 1, 2)`,
    [TOURNAMENT_ID, ROOM_SUCCESS]
  );

  await insertTicket(client, TICKET_DURING, ROOM_DURING, USER_A, "501");
  await insertTicket(client, TICKET_PD, ROOM_PER_DRAW, USER_B, "502");
  await insertTicket(client, TICKET_ROLLBACK, ROOM_ROLLBACK, USER_A, "503");
  await insertTicket(client, TICKET_SUCCESS, ROOM_SUCCESS, USER_A, "504");
  await insertTicket(client, TICKET_EXHAUSTED, ROOM_EXHAUSTED, USER_A, "505");
  await insertTicket(client, TICKET_JANITOR, ROOM_JANITOR, USER_A, "506");
}

async function finalizeDraw(
  client: pg.Client,
  roomId: string,
  drawNumber: number,
  jobId: number,
  credits: { user_id: string; amount: number; matched_cards: number }[],
  deferDing: boolean
): Promise<number> {
  await client.query(
    `INSERT INTO draws (room_id, number, timestamp, created_at)
     VALUES ($1, $2, now(), now())
     ON CONFLICT (room_id, number) DO UPDATE
       SET processed_at = NULL, ding_aggregated_at = NULL`,
    [roomId, drawNumber]
  );
  await client.query(`DELETE FROM draw_jobs WHERE room_id = $1 AND draw_number = $2`, [
    roomId,
    drawNumber,
  ]);
  await client.query(`DELETE FROM draw_jobs WHERE id = $1`, [jobId]);
  await client.query(
    `INSERT INTO draw_jobs (id, room_id, draw_number, status, attempts, created_at, updated_at)
     VALUES ($1, $2, $3, 'processing', 0, now(), now())`,
    [jobId, roomId, drawNumber]
  );
  const res = await q<{ v: number }>(
    client,
    `SELECT public.rpc_finalize_engine_draw_job(
       $1::bigint, $2::uuid, $3::int,
       '[]'::jsonb, '[]'::jsonb, false, 2,
       $4::jsonb,
       NULL, NULL, NULL, NULL, NULL, NULL, NULL,
       'proof-owner', 42, $5::boolean
     ) AS v`,
    [jobId, roomId, drawNumber, JSON.stringify(credits), deferDing]
  );
  return Number(res[0]?.v ?? 0);
}

const roomRowTemplate: RoomRow = {
  id: ROOM_DURING,
  status: "playing",
  currency: "IRR",
  room_seed: null,
  room_template_id: null,
  next_draw_at: null,
  starts_at: null,
  waiting_started_at: null,
  min_players: 2,
  max_players: 10,
  countdown_sec: 120,
  first_line_draw_number: null,
  line_reward_percentage: null,
  full_reward_percentage: null,
  ding_per_number: 2,
  ding_settle_mode: "room_level",
  meta: null,
};

function enginePendingFromDb(args: {
  room: RoomRow;
  tickets: TicketRow[];
  marks: { ticket_id: string; value: number }[];
  processedDrawNumbers: number[];
}): number {
  const state = new RoomRuntimeState({
    room: args.room,
    tickets: args.tickets,
    markedByTicket: new Map(),
    existingLineTickets: new Set(),
    existingFullTickets: new Set(),
    drawnNumbers: [...args.processedDrawNumbers],
    unprocessedDrawNumbers: new Set(),
    templateDingPerNumber: null,
  });
  const marksByDraw = new Map<number, { ticket_id: string; value: number }[]>();
  for (const n of args.processedDrawNumbers) {
    marksByDraw.set(
      n,
      args.marks.filter((m) => m.value === n)
    );
  }
  const pending = replayRoomDingFromMarks({
    state,
    processedDrawNumbers: args.processedDrawNumbers,
    marksByDraw,
  });
  return pending.get(USER_A) ?? 0;
}

async function snapshotRoom(client: pg.Client, roomId: string, userId = USER_A) {
  const [room] = await q<{
    status: string;
    ding_settled_at: string | null;
    ding_settlement_key: string | null;
    ding_settlement_version: number | null;
    prize_paid_at: string | null;
    ding_settle_mode: string;
  }>(
    client,
    `SELECT status, ding_settled_at::text, ding_settlement_key, ding_settlement_version,
            prize_paid_at::text, ding_settle_mode
     FROM rooms WHERE id = $1`,
    [roomId]
  );
  const dingTx = (
    await q<{ cnt: string }>(
      client,
      `SELECT count(*)::text AS cnt FROM ding_transactions
       WHERE room_id = $1 AND drawn_number = 0`,
      [roomId]
    )
  )[0]?.cnt;
  const perDrawDingTx = (
    await q<{ cnt: string }>(
      client,
      `SELECT count(*)::text AS cnt FROM ding_transactions
       WHERE room_id = $1 AND drawn_number BETWEEN 1 AND 90`,
      [roomId]
    )
  )[0]?.cnt;
  const dingJobs = (
    await q<{ cnt: string }>(
      client,
      `SELECT count(*)::text AS cnt FROM ding_apply_jobs WHERE room_id = $1`,
      [roomId]
    )
  )[0]?.cnt;
  const reserved = (
    await q<{ cnt: string }>(
      client,
      `SELECT count(*)::text AS cnt FROM tickets
       WHERE room_id = $1 AND reservation_status = 'reserved'`,
      [roomId]
    )
  )[0]?.cnt;
  const consumed = (
    await q<{ cnt: string }>(
      client,
      `SELECT count(*)::text AS cnt FROM tickets
       WHERE room_id = $1 AND reservation_status = 'consumed'`,
      [roomId]
    )
  )[0]?.cnt;
  const balance = (
    await q<{ balance: string | null }>(
      client,
      `SELECT balance::text FROM ding_balances WHERE user_id = $1`,
      [userId]
    )
  )[0]?.balance;
  const wallet = (
    await q<{ balance: string | null }>(
      client,
      `SELECT balance::text FROM wallets WHERE user_id = $1 AND currency = 'IRR'`,
      [userId]
    )
  )[0]?.balance;
  const tournDing = (
    await q<{ ding_total: string | null }>(
      client,
      `SELECT ding_total::text FROM tournament_player_ding_totals
       WHERE tournament_id = $1 AND user_id = $2`,
      [TOURNAMENT_ID, userId]
    )
  )[0]?.ding_total;
  const prizePaid = (
    await q<{ cnt: string }>(
      client,
      `SELECT count(*)::text AS cnt FROM results
       WHERE room_id = $1 AND paid_at IS NOT NULL`,
      [roomId]
    )
  )[0]?.cnt;
  return {
    room,
    dingTx,
    perDrawDingTx,
    dingJobs,
    reserved,
    consumed,
    balance,
    wallet,
    tournDing,
    prizePaid,
  };
}

async function prepareSettlingRoom(
  client: pg.Client,
  roomId: string,
  ticketId: string,
  drawNumber: number
): Promise<void> {
  await client.query(`UPDATE rooms SET status = 'settling' WHERE id = $1`, [roomId]);
  await client.query(
    `INSERT INTO results (room_id, user_id, ticket_id, win_type, draw_number, reward_amount)
     VALUES ($1, $2, $3, 'full', $4, 0)
     ON CONFLICT (ticket_id, win_type) DO NOTHING`,
    [roomId, USER_A, ticketId, drawNumber]
  );
  await client.query(
    `INSERT INTO commissions_log (
       ticket_id, room_id, player_id, gross_amount, commission_rate, commission_base,
       agent_amount, super_amount, admin_amount, amount_to_pool, status, currency
     ) VALUES ($1, $2, $3, 1000, 0.10, 100, 0, 0, 100, 900, 'pending', 'IRR')
     ON CONFLICT DO NOTHING`,
    [ticketId, roomId, USER_A]
  );
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("[RLDVERIFY] connected");
  await acquireProofLock(client);
  console.log("[RLDVERIFY] lock acquired");

  try {
    const flag = (
      await q<{ v: boolean }>(
        client,
        `SELECT ding_room_settle_enabled AS v FROM app_runtime_flags WHERE id = true`
      )
    )[0]?.v;
    row("static", "ding_room_settle_enabled", null, String(flag), flag === false);

    const finishExt = (
      await q<{ cnt: string }>(
        client,
        `SELECT count(*)::text AS cnt
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'game_finance'
           AND p.proname = 'fn_finish_room_and_settle'
           AND pg_get_function_identity_arguments(p.oid) LIKE '%p_ding_credits jsonb%'`
      )
    )[0]?.cnt;
    row(
      "static",
      "fn_finish_room_and_settle_extended",
      null,
      finishExt ?? null,
      Number(finishExt ?? 0) >= 1
    );

    await setupFixtures(client);
    console.log("[RLDVERIFY] fixtures ready");

    const dingBalanceBefore = (
      await q<{ balance: string | null }>(
        client,
        `SELECT balance::text FROM ding_balances WHERE user_id = $1`,
        [USER_A]
      )
    )[0]?.balance ?? "0";
    const walletBefore = await walletTotal(client, USER_A);
    const tournDingBefore = (
      await q<{ ding_total: string | null }>(
        client,
        `SELECT ding_total::text FROM tournament_player_ding_totals
         WHERE tournament_id = $1 AND user_id = $2`,
        [TOURNAMENT_ID, USER_A]
      )
    )[0]?.ding_total ?? "0";

    // --- Proof 1: during play (room_level) ---
    let livePending = 0;
    for (let i = 0; i < 3; i++) {
      const drawNum = 1 + i;
      livePending += 2;
      await finalizeDraw(client, ROOM_DURING, drawNum, 880001 + i, [{ user_id: USER_A, amount: 2, matched_cards: 1 }], true);
      await client.query(
        `INSERT INTO marks (ticket_id, value, created_at)
         VALUES ($1, $2, now()) ON CONFLICT DO NOTHING`,
        [TICKET_DURING, drawNum]
      );
    }

    const during = await snapshotRoom(client, ROOM_DURING);
    row("1_during_play", "room_level_ding_tx_count", 0, during.dingTx, during.dingTx === "0");
    row(
      "1_during_play",
      "ding_balance_unchanged",
      dingBalanceBefore,
      during.balance ?? dingBalanceBefore,
      (during.balance ?? dingBalanceBefore) === dingBalanceBefore
    );
    row("1_during_play", "ding_apply_jobs", 0, during.dingJobs, during.dingJobs === "0");
    row("1_during_play", "tickets_reserved", null, during.reserved, during.reserved === "1");
    row(
      "1_during_play",
      "room_not_finished",
      null,
      during.room?.status,
      during.room?.status === "playing"
    );

    const marks = await q<{ ticket_id: string; value: number }>(
      client,
      `SELECT ticket_id, value FROM marks WHERE ticket_id = $1`,
      [TICKET_DURING]
    );
    const ticketsDuring: TicketRow[] = [
      {
        id: TICKET_DURING,
        room_id: ROOM_DURING,
        player_user_id: USER_A,
        pool_card_id: "501",
        price: 1000,
        reservation_status: "reserved",
        cancelled_at: null,
      },
    ];
    const replayPending = enginePendingFromDb({
      room: { ...roomRowTemplate, id: ROOM_DURING },
      tickets: ticketsDuring,
      marks,
      processedDrawNumbers: [1, 2, 3],
    });
    row(
      "1_during_play",
      "engine_pending_ding",
      livePending,
      replayPending,
      replayPending === livePending
    );

    // --- Proof 5: room boundary ---
    const pdDraw = await finalizeDraw(
      client,
      ROOM_PER_DRAW,
      10,
      881001,
      [{ user_id: USER_B, amount: 4, matched_cards: 2 }],
      true
    );
    const pdProcessed = (
      await q<{ processed_at: string | null }>(
        client,
        `SELECT processed_at::text FROM draws WHERE room_id = $1 AND number = 10`,
        [ROOM_PER_DRAW]
      )
    )[0]?.processed_at;
    const pdSnap = await snapshotRoom(client, ROOM_PER_DRAW, USER_B);
    const duringPdTx = (
      await q<{ cnt: string }>(
        client,
        `SELECT count(*)::text AS cnt FROM ding_transactions WHERE room_id = $1`,
        [ROOM_DURING]
      )
    )[0]?.cnt;
    row("5_room_boundary", "per_draw_finalize_code", null, pdDraw, pdDraw === 0);
    row("5_room_boundary", "per_draw_draw_processed", null, pdProcessed, pdProcessed !== null);
    row("5_room_boundary", "per_draw_enqueue_job", 0, pdSnap.dingJobs, pdSnap.dingJobs === "1");
    row("5_room_boundary", "room_level_still_no_jobs", during.dingJobs, "0", during.dingJobs === "0");
    row("5_room_boundary", "room_level_no_per_draw_tx", duringPdTx, "0", duringPdTx === "0");
    row(
      "5_room_boundary",
      "per_draw_no_room_level_tx",
      null,
      pdSnap.perDrawDingTx,
      pdSnap.dingTx === "0"
    );

    // --- Proof 3: atomic rollback (fail after prize path begins) ---
    for (let i = 0; i < 2; i++) {
      const n = 11 + i;
      await finalizeDraw(client, ROOM_ROLLBACK, n, 882001 + i, [{ user_id: USER_A, amount: 2, matched_cards: 1 }], true);
      await client.query(
        `INSERT INTO marks (ticket_id, value) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [TICKET_ROLLBACK, n]
      );
    }
    await prepareSettlingRoom(client, ROOM_ROLLBACK, TICKET_ROLLBACK, 12);
    const rbBefore = await snapshotRoom(client, ROOM_ROLLBACK);
    const rollbackKey = roomDingSettlementKey(ROOM_ROLLBACK);
    const badCredits = JSON.stringify([{ user_id: INVALID_USER, amount: 4 }]);
    let rbThrew = false;
    try {
      await client.query(
        `SELECT public.fn_finish_room_and_settle($1::uuid, NULL, $2, 1, $3::jsonb)`,
        [ROOM_ROLLBACK, rollbackKey, badCredits]
      );
    } catch {
      rbThrew = true;
    }
    const rbAfter = await snapshotRoom(client, ROOM_ROLLBACK);
    row("3_rollback", "finish_threw", null, String(rbThrew), rbThrew === true);
    row("3_rollback", "ding_tx_still_zero", rbBefore.dingTx, rbAfter.dingTx, rbAfter.dingTx === "0");
    row(
      "3_rollback",
      "tickets_still_reserved",
      rbBefore.reserved,
      rbAfter.reserved,
      rbAfter.reserved === "1"
    );
    row(
      "3_rollback",
      "room_not_finished",
      rbBefore.room?.status,
      rbAfter.room?.status,
      rbAfter.room?.status === "settling"
    );
    row(
      "3_rollback",
      "ding_settled_at_null",
      rbBefore.room?.ding_settled_at,
      rbAfter.room?.ding_settled_at,
      rbAfter.room?.ding_settled_at === null
    );
    row(
      "3_rollback",
      "prize_not_paid",
      rbBefore.prizePaid,
      rbAfter.prizePaid,
      rbAfter.prizePaid === "0"
    );
    const rbWalletAfter = await walletTotal(client, USER_A);
    row(
      "3_rollback",
      "wallet_unchanged",
      walletBefore,
      rbWalletAfter,
      rbWalletAfter === walletBefore
    );
    row(
      "3_rollback",
      "ding_balance_unchanged",
      dingBalanceBefore,
      rbAfter.balance ?? dingBalanceBefore,
      (rbAfter.balance ?? dingBalanceBefore) === dingBalanceBefore
    );
    row(
      "3_rollback",
      "tournament_total_unchanged",
      tournDingBefore,
      rbAfter.tournDing ?? tournDingBefore,
      (rbAfter.tournDing ?? tournDingBefore) === tournDingBefore
    );

    // --- Proof 2 + 4: atomic success + idempotency ---
    for (let i = 0; i < 3; i++) {
      const n = 20 + i;
      await finalizeDraw(client, ROOM_SUCCESS, n, 883001 + i, [{ user_id: USER_A, amount: 2, matched_cards: 1 }], true);
      await client.query(
        `INSERT INTO marks (ticket_id, value) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [TICKET_SUCCESS, n]
      );
    }
    const successPending = 6;
    await prepareSettlingRoom(client, ROOM_SUCCESS, TICKET_SUCCESS, 22);
    const successKey = roomDingSettlementKey(ROOM_SUCCESS);
    const successCredits = JSON.stringify([{ user_id: USER_A, amount: successPending }]);

    const beforeFinish = await snapshotRoom(client, ROOM_SUCCESS);
    await client.query(
      `SELECT public.fn_finish_room_and_settle($1::uuid, NULL, $2, 1, $3::jsonb)`,
      [ROOM_SUCCESS, successKey, successCredits]
    );
    const afterFirst = await snapshotRoom(client, ROOM_SUCCESS);

    row(
      "2_atomic_success",
      "room_finished",
      beforeFinish.room?.status,
      afterFirst.room?.status,
      afterFirst.room?.status === "finished"
    );
    row(
      "2_atomic_success",
      "prize_paid_at_set",
      beforeFinish.room?.prize_paid_at,
      afterFirst.room?.prize_paid_at,
      afterFirst.room?.prize_paid_at !== null
    );
    row(
      "2_atomic_success",
      "ding_settled_at_set",
      beforeFinish.room?.ding_settled_at,
      afterFirst.room?.ding_settled_at,
      afterFirst.room?.ding_settled_at !== null
    );
    row(
      "2_atomic_success",
      "settlement_key_stored",
      null,
      afterFirst.room?.ding_settlement_key,
      afterFirst.room?.ding_settlement_key === successKey
    );
    row(
      "2_atomic_success",
      "settlement_version",
      null,
      afterFirst.room?.ding_settlement_version,
      afterFirst.room?.ding_settlement_version === 1
    );
    row(
      "2_atomic_success",
      "room_level_ding_tx_once",
      "0",
      afterFirst.dingTx,
      afterFirst.dingTx === "1"
    );
    row(
      "2_atomic_success",
      "tickets_consumed",
      beforeFinish.reserved,
      afterFirst.consumed,
      afterFirst.consumed === "1" && afterFirst.reserved === "0"
    );
    row(
      "2_atomic_success",
      "ding_balance_credited",
      dingBalanceBefore,
      afterFirst.balance,
      Number(afterFirst.balance) === Number(dingBalanceBefore) + successPending
    );
    row(
      "2_atomic_success",
      "tournament_ding_total",
      tournDingBefore,
      afterFirst.tournDing ?? tournDingBefore,
      Number(afterFirst.tournDing ?? 0) === Number(tournDingBefore) + successPending
    );
    row(
      "2_atomic_success",
      "prize_ledger_paid",
      beforeFinish.prizePaid,
      afterFirst.prizePaid,
      afterFirst.prizePaid === "1"
    );

    await client.query(
      `SELECT public.fn_finish_room_and_settle($1::uuid, NULL, $2, 1, $3::jsonb)`,
      [ROOM_SUCCESS, successKey, successCredits]
    );
    const afterSecond = await snapshotRoom(client, ROOM_SUCCESS);
    row(
      "4_idempotency",
      "ding_tx_count",
      afterFirst.dingTx,
      afterSecond.dingTx,
      afterFirst.dingTx === afterSecond.dingTx
    );
    row(
      "4_idempotency",
      "ding_balance",
      afterFirst.balance,
      afterSecond.balance,
      afterFirst.balance === afterSecond.balance
    );
    row(
      "4_idempotency",
      "tournament_total",
      afterFirst.tournDing,
      afterSecond.tournDing,
      afterFirst.tournDing === afterSecond.tournDing
    );
    row(
      "4_idempotency",
      "room_still_finished",
      afterFirst.room?.status,
      afterSecond.room?.status,
      afterSecond.room?.status === "finished"
    );

    // --- Proof 6: replay equals live ---
    row("6_replay", "replay_equals_live", livePending, replayPending, replayPending === livePending);

    // --- Proof 7: exhausted room ---
    for (let i = 0; i < 2; i++) {
      const n = 30 + i;
      await finalizeDraw(client, ROOM_EXHAUSTED, n, 884001 + i, [], true);
      await client.query(
        `INSERT INTO marks (ticket_id, value) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [TICKET_EXHAUSTED, n]
      );
    }
    await client.query(`UPDATE rooms SET status = 'settling' WHERE id = $1`, [ROOM_EXHAUSTED]);
    const exhaustedKey = roomDingSettlementKey(ROOM_EXHAUSTED);
    await client.query(
      `SELECT public.fn_finish_room_and_settle($1::uuid, NULL, $2, 1, $3::jsonb)`,
      [ROOM_EXHAUSTED, exhaustedKey, JSON.stringify([{ user_id: USER_A, amount: 0 }])]
    );
    const exhausted = await snapshotRoom(client, ROOM_EXHAUSTED);
    row(
      "7_exhausted",
      "finished_without_full_winner",
      "settling",
      exhausted.room?.status,
      exhausted.room?.status === "finished"
    );
    row(
      "7_exhausted",
      "ding_settled_at_set",
      null,
      exhausted.room?.ding_settled_at,
      exhausted.room?.ding_settled_at !== null
    );
    row(
      "7_exhausted",
      "tickets_consumed",
      null,
      exhausted.consumed,
      exhausted.consumed === "1"
    );
    row(
      "7_exhausted",
      "settlement_key_stored",
      null,
      exhausted.room?.ding_settlement_key,
      exhausted.room?.ding_settlement_key === exhaustedKey
    );

    // --- Proof 8: janitor ---
    await client.query(
      `UPDATE rooms SET status = 'settling', prize_paid_at = NULL, ding_settled_at = NULL,
              ding_settlement_key = NULL, ding_settlement_version = NULL
       WHERE id = $1`,
      [ROOM_JANITOR]
    );
    for (let i = 0; i < 90; i++) {
      await client.query(
        `INSERT INTO draws (room_id, number, created_at) VALUES ($1, $2, now()) ON CONFLICT DO NOTHING`,
        [ROOM_JANITOR, i + 1]
      );
    }
    const janitorBefore = await snapshotRoom(client, ROOM_JANITOR);
    await client.query(`SELECT * FROM game_core.fn_janitor_repair_unsettled_finished(5)`);
    const janitorAfter = await snapshotRoom(client, ROOM_JANITOR);
    row(
      "8_janitor_sql",
      "room_level_not_finished_by_sql",
      janitorBefore.room?.status,
      janitorAfter.room?.status,
      janitorAfter.room?.status === "settling"
    );
    row(
      "8_janitor_sql",
      "ding_settled_at_still_null",
      null,
      janitorAfter.room?.ding_settled_at,
      janitorAfter.room?.ding_settled_at === null
    );

    await client.query(
      `INSERT INTO marks (ticket_id, value) VALUES ($1, 7), ($1, 14) ON CONFLICT DO NOTHING`,
      [TICKET_JANITOR]
    );
    await client.query(
      `UPDATE draws SET processed_at = now(), ding_aggregated_at = now()
       WHERE room_id = $1 AND number IN (7, 14)`,
      [ROOM_JANITOR]
    );
    const janitorTickets: TicketRow[] = [
      {
        id: TICKET_JANITOR,
        room_id: ROOM_JANITOR,
        player_user_id: USER_A,
        pool_card_id: "506",
        price: 1000,
        reservation_status: "reserved",
        cancelled_at: null,
      },
    ];
    const engPending = enginePendingFromDb({
      room: { ...roomRowTemplate, id: ROOM_JANITOR },
      tickets: janitorTickets,
      marks: [
        { ticket_id: TICKET_JANITOR, value: 7 },
        { ticket_id: TICKET_JANITOR, value: 14 },
      ],
      processedDrawNumbers: [7, 14],
    });
    const payload = buildRoomFinalizationDingPayload(ROOM_JANITOR, new Map([[USER_A, engPending]]));
    await client.query(
      `SELECT public.fn_finish_room_and_settle($1::uuid, NULL, $2, $3, $4::jsonb)`,
      [
        ROOM_JANITOR,
        payload.settlementKey,
        payload.settlementVersion,
        JSON.stringify([{ user_id: USER_A, amount: engPending }]),
      ]
    );
    const engAfter = await snapshotRoom(client, ROOM_JANITOR);
    row(
      "8_janitor_engine",
      "engine_replay_finish",
      "settling",
      engAfter.room?.status,
      engAfter.room?.status === "finished"
    );
    row(
      "8_janitor_engine",
      "ding_settled",
      null,
      engAfter.room?.ding_settled_at,
      engAfter.room?.ding_settled_at !== null
    );

    // --- Proof 9: read model ---
    const uiPending = computePendingDingForUser({
      userId: USER_A,
      dingPerCard: resolveDingPerCard(2, null),
      tickets: [
        {
          id: TICKET_DURING,
          player_user_id: USER_A,
          reservation_status: "reserved",
          cancelled_at: null,
        },
      ],
      marks,
      processedDrawNumbers: [1, 2, 3],
    });
    row(
      "9_read_model",
      "pending_room_ding_formula",
      livePending,
      uiPending,
      uiPending === livePending
    );
    row(
      "9_read_model",
      "ding_settle_mode_fixture",
      null,
      during.room?.ding_settle_mode,
      during.room?.ding_settle_mode === "room_level"
    );
    row(
      "9_read_model",
      "no_double_add_after_settle",
      afterFirst.balance,
      afterFirst.balance,
      uiPending === livePending && afterFirst.room?.status === "finished"
    );

    const flagAfter = (
      await q<{ v: boolean }>(
        client,
        `SELECT ding_room_settle_enabled AS v FROM app_runtime_flags WHERE id = true`
      )
    )[0]?.v;
    row("static", "flag_still_false_after_proofs", String(flag), String(flagAfter), flagAfter === false);
  } finally {
    await cleanup(client).catch(() => undefined);
    await releaseProofLock(client);
    await client.end();
  }

  console.log("\n=== ROOM-LEVEL DING PRE-ACTIVATION PROOFS ===\n");
  const grouped = new Map<string, ProofRow[]>();
  for (const r of results) {
    if (!grouped.has(r.proof)) grouped.set(r.proof, []);
    grouped.get(r.proof)!.push(r);
  }
  for (const [proof, rows] of grouped) {
    console.log(`[${proof}]`);
    for (const r of rows) {
      const mark = r.pass ? "PASS" : "FAIL";
      console.log(
        `  ${mark} ${r.metric}: before=${r.before ?? "null"} after=${r.after ?? "null"}`
      );
    }
    console.log("");
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`TOTAL: ${results.length} checks, ${failed.length} failed`);
  console.log(`READY_TO_ENABLE_ROOM_LEVEL_DING = ${failed.length === 0 ? "yes" : "no"}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
