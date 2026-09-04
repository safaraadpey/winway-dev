#!/usr/bin/env node
/**
 * Regression: every live room INSERT path stamps ding_settle_mode via
 * fn_resolve_ding_settle_mode_for_new_room() — not column DEFAULT alone.
 *
 * Fixtures are isolated from the player lobby:
 *   room_type = tournament, never (active + normal).
 * Cleanup always runs in finally and is not silently ignored.
 */
import "dotenv/config";
import pg from "pg";

const DB =
  process.env.DATABASE_URL ??
  process.env.SUPABASE_DB_URL ??
  process.env.POSTGRES_URL;

if (!DB) {
  console.error("Missing DATABASE_URL");
  process.exit(2);
}

const LOCK_KEY = 61004180001;
const TAG = "RLDCREATE";
const USER_A = "13c5deb7-10d5-46e8-88f0-0f4a2ac0fabd";
const SOURCE_ROOM_TRUE = "dddddddd-dddd-dddd-dddd-000000000031";
const SOURCE_ROOM_FALSE = "dddddddd-dddd-dddd-dddd-000000000032";
const TEMPLATE_SERIAL_TRUE = "dddddddd-dddd-dddd-dddd-000000000041";
const TEMPLATE_SERIAL_FALSE = "dddddddd-dddd-dddd-dddd-000000000042";
const TOURNAMENT_ID = "dddddddd-dddd-dddd-dddd-000000000003";
const TRR_ID = "dddddddd-dddd-dddd-dddd-000000000004";
const TEMPLATE_SYSTEM_TRUE = "dddddddd-dddd-dddd-dddd-000000000011";
const TEMPLATE_SYSTEM_FALSE = "dddddddd-dddd-dddd-dddd-000000000012";
const TEMPLATE_JOIN_TRUE = "dddddddd-dddd-dddd-dddd-000000000021";
const TEMPLATE_JOIN_FALSE = "dddddddd-dddd-dddd-dddd-000000000022";

const PROOF_TEMPLATE_IDS = [
  TEMPLATE_SYSTEM_TRUE,
  TEMPLATE_SYSTEM_FALSE,
  TEMPLATE_JOIN_TRUE,
  TEMPLATE_JOIN_FALSE,
  TEMPLATE_SERIAL_TRUE,
  TEMPLATE_SERIAL_FALSE,
] as const;

/** Isolated from lobby-snapshot (normal + not inactive). Join still accepts active tournament. */
const FIXTURE_ROOM_TYPE = "tournament";
const FIXTURE_STATUS = "active";
const FIXTURE_PRICE = 0;
const UNSAFE_LIVE_OVERRIDE = "RLDCREATE_UNSAFE_LIVE_DB";

interface Check {
  path: string;
  flag: boolean;
  expected: "room_level" | "per_draw";
  actual: string | null;
  pass: boolean;
  detail?: string;
}

const checks: Check[] = [];

function isLiveLikeDatabase(connectionString: string): boolean {
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "postgres" ||
      host === "db" ||
      host.endsWith(".local")
    ) {
      return false;
    }
    if (
      host.includes("supabase.co") ||
      host.includes("supabase.com") ||
      host.includes("pooler.supabase") ||
      host.includes("neon.tech") ||
      host.includes("rds.amazonaws.com")
    ) {
      return true;
    }
    return true;
  } catch {
    return true;
  }
}

function assertSafeDatabase(connectionString: string): void {
  if (!isLiveLikeDatabase(connectionString)) return;
  if (process.env[UNSAFE_LIVE_OVERRIDE] === "1") {
    console.warn(
      `[${TAG}] UNSAFE override ${UNSAFE_LIVE_OVERRIDE}=1 — running against live-like DB. Fixtures stay tournament, never active+normal.`
    );
    return;
  }
  console.error(
    `[${TAG}] Refusing to run against a live-like database.\n` +
      `Set ${UNSAFE_LIVE_OVERRIDE}=1 only if you accept mutating that DB.\n` +
      `Proof templates are never inserted as status=active AND room_type=normal.`
  );
  process.exit(2);
}

async function q<T = Record<string, unknown>>(
  client: pg.Client,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await client.query(sql, params);
  return res.rows as T[];
}

async function execRequired(
  client: pg.Client,
  label: string,
  sql: string,
  params: unknown[] = []
): Promise<void> {
  try {
    await client.query(sql, params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[${TAG}] cleanup failed at ${label}: ${message}`);
  }
}

async function acquireLock(client: pg.Client): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const res = await client.query(`SELECT pg_try_advisory_lock($1) AS ok`, [LOCK_KEY]);
    if (res.rows[0]?.ok === true) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Could not acquire advisory lock");
}

async function setFlag(client: pg.Client, enabled: boolean): Promise<void> {
  await client.query(
    `UPDATE public.app_runtime_flags SET ding_room_settle_enabled = $1, updated_at = now() WHERE id = true`,
    [enabled]
  );
}

async function assertNotVisibleInLobby(client: pg.Client, phase: string): Promise<void> {
  const leaked = await q<{ id: string; name: string; price: string; status: string; room_type: string }>(
    client,
    `SELECT id, name, price::text, status::text, room_type::text
     FROM public.room_templates
     WHERE (
       id = ANY($1::uuid[])
       OR name LIKE $2
     )
       AND status <> 'inactive'::public.room_template_status
       AND room_type = 'normal'::public.room_type`,
    [PROOF_TEMPLATE_IDS, `${TAG}%`]
  );
  const pass = leaked.length === 0;
  checks.push({
    path: `lobby-snapshot-isolation:${phase}`,
    flag: true,
    expected: "room_level",
    actual: pass ? "hidden" : `leaked:${leaked.length}`,
    pass,
    detail: pass
      ? "proof templates not in lobby (normal + not inactive)"
      : leaked.map((r) => `${r.id}:${r.name}:${r.status}:${r.room_type}`).join(";"),
  });
  if (!pass) {
    throw new Error(`[${TAG}] lobby leak at ${phase}: ${JSON.stringify(leaked)}`);
  }
}

const PROOF_ROOM_MATCH = `
  meta->>'proof_tag' = $1
  OR id = ANY($2::uuid[])
  OR room_template_id = ANY($3::uuid[])
`;

async function deleteProofRoomsWithRetry(client: pg.Client): Promise<void> {
  const params = [TAG, [SOURCE_ROOM_TRUE, SOURCE_ROOM_FALSE], PROOF_TEMPLATE_IDS];
  await execRequired(
    client,
    "cancel-proof-rooms",
    `UPDATE public.rooms
     SET status = 'cancelled'::public.room_status, updated_at = now()
     WHERE ${PROOF_ROOM_MATCH}`,
    params
  );

  let lastMessage = "unknown";
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT id FROM public.rooms WHERE ${PROOF_ROOM_MATCH} FOR UPDATE`,
        params
      );
      await client.query(
        `DELETE FROM public.tickets WHERE room_id IN (
           SELECT id FROM public.rooms WHERE ${PROOF_ROOM_MATCH}
         )`,
        params
      );
      await client.query(
        `DELETE FROM public.ding_apply_jobs
         WHERE draw_id IN (
           SELECT d.id FROM public.draws d
           WHERE d.room_id IN (
             SELECT id FROM public.rooms WHERE ${PROOF_ROOM_MATCH}
           )
         )`,
        params
      );
      await client.query(`DELETE FROM public.rooms WHERE ${PROOF_ROOM_MATCH}`, params);
      await client.query("COMMIT");
      return;
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : String(err);
      try {
        await client.query("ROLLBACK");
      } catch {
        // session may already be aborted
      }
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }
  throw new Error(`[${TAG}] cleanup failed at delete-proof-rooms: ${lastMessage}`);
}

async function cleanup(client: pg.Client): Promise<void> {
  await client.query(`SET lock_timeout = '8s'`);

  await execRequired(
    client,
    "deactivate-proof-templates",
    `UPDATE public.room_templates
     SET status = 'inactive'::public.room_template_status,
         room_type = 'tournament'::public.room_type,
         updated_at = now()
     WHERE id = ANY($1::uuid[])
       AND name LIKE $2`,
    [PROOF_TEMPLATE_IDS, `${TAG}%`]
  );

  await execRequired(
    client,
    "delete-proof-tournament-assignments",
    `DELETE FROM public.tournament_round_assignments WHERE tournament_id = $1`,
    [TOURNAMENT_ID]
  );
  await execRequired(
    client,
    "delete-proof-tournament-round-rooms",
    `DELETE FROM public.tournament_round_rooms WHERE tournament_id = $1`,
    [TOURNAMENT_ID]
  );
  await execRequired(
    client,
    "delete-proof-tournament",
    `DELETE FROM public.tournaments WHERE id = $1`,
    [TOURNAMENT_ID]
  );

  await deleteProofRoomsWithRetry(client);

  try {
    await client.query(
      `DELETE FROM public.room_templates
       WHERE id = ANY($1::uuid[])
         AND name LIKE $2`,
      [PROOF_TEMPLATE_IDS, `${TAG}%`]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[${TAG}] template delete failed after deactivate (templates left inactive): ${message}`
    );
  }
}

async function insertProofTemplate(
  client: pg.Client,
  templateId: string,
  label: string
): Promise<void> {
  if (FIXTURE_STATUS === "active" && FIXTURE_ROOM_TYPE === "normal") {
    throw new Error(`[${TAG}] refuse to insert active+normal proof template`);
  }
  await client.query(
    `INSERT INTO public.room_templates (
       id, name, price, currency, min_players, max_cards_per_player,
       countdown_sec, room_type, status, created_at, updated_at
     )
     VALUES (
       $1, $2, $3, 'IRR', 2, 10, 120,
       $4::public.room_type,
       $5::public.room_template_status,
       now(), now()
     )
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       price = EXCLUDED.price,
       room_type = EXCLUDED.room_type,
       status = EXCLUDED.status,
       updated_at = now()`,
    [templateId, label, FIXTURE_PRICE, FIXTURE_ROOM_TYPE, FIXTURE_STATUS]
  );
}

async function ensureSourceRoom(
  client: pg.Client,
  poolId: string,
  sourceRoomId: string,
  templateId: string
): Promise<void> {
  await insertProofTemplate(client, templateId, `${TAG} serial ${templateId.slice(-2)}`);
  await execRequired(
    client,
    "delete-waiting-on-serial-template",
    `DELETE FROM public.rooms WHERE room_template_id = $1 AND status = 'waiting'`,
    [templateId]
  );
  await client.query(
    `INSERT INTO public.rooms (
       id, room_template_id, status, card_price, currency, pool_id,
       min_players, max_cards_per_player, countdown_sec,
       room_seed, room_seed_hash, waiting_started_at, ding_settle_mode,
       meta, created_at, updated_at
     )
     SELECT $1, $2, 'waiting', 0, 'IRR', $3,
            2, 10, 120,
            seed, seed_hash, now(), 'per_draw',
            jsonb_build_object('proof_tag', $4::text, 'source', 'proof_fixture'),
            now(), now()
     FROM game_core.fn_generate_room_seed()
     ON CONFLICT (id) DO UPDATE SET
       room_template_id = EXCLUDED.room_template_id,
       meta = EXCLUDED.meta,
       updated_at = now()`,
    [sourceRoomId, templateId, poolId, TAG]
  );
}

function record(
  path: string,
  flag: boolean,
  expected: "room_level" | "per_draw",
  actual: string | null,
  detail?: string
): void {
  checks.push({
    path,
    flag,
    expected,
    actual,
    pass: actual === expected,
    detail,
  });
}

async function modeForRoom(client: pg.Client, roomId: string): Promise<string | null> {
  const rows = await q<{ ding_settle_mode: string }>(
    client,
    `SELECT ding_settle_mode FROM public.rooms WHERE id = $1`,
    [roomId]
  );
  return rows[0]?.ding_settle_mode ?? null;
}

async function testSystemJoinOrCreate(
  client: pg.Client,
  flag: boolean,
  templateId: string
): Promise<void> {
  const expected = flag ? "room_level" : "per_draw";
  await setFlag(client, flag);
  const suffix = flag ? "t" : "f";
  await insertProofTemplate(client, templateId, `${TAG} system ${suffix}`);
  await execRequired(
    client,
    "delete-tickets-before-system-join",
    `DELETE FROM public.tickets WHERE room_id IN (
    SELECT id FROM public.rooms WHERE room_template_id = $1 AND status = 'waiting'
  )`,
    [templateId]
  );
  await execRequired(
    client,
    "delete-waiting-before-system-join",
    `DELETE FROM public.rooms WHERE room_template_id = $1 AND status = 'waiting'`,
    [templateId]
  );
  const rows = await q<{ room_id: string }>(
    client,
    `SELECT room_id FROM game_core.fn_system_join_or_create_room($1, $2, 1, NULL) LIMIT 1`,
    [USER_A, templateId]
  );
  const roomId = rows[0]?.room_id;
  const mode = roomId ? await modeForRoom(client, roomId) : null;
  record("fn_system_join_or_create_room", flag, expected, mode, roomId ?? "no room");
  if (roomId) {
    await client.query(
      `UPDATE public.rooms SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('proof_tag', $2::text)
       WHERE id = $1`,
      [roomId, TAG]
    );
  }
}

async function testSerialSuccessor(
  client: pg.Client,
  flag: boolean,
  poolId: string,
  sourceRoomId: string,
  templateId: string
): Promise<void> {
  const expected = flag ? "room_level" : "per_draw";
  await setFlag(client, flag);
  await ensureSourceRoom(client, poolId, sourceRoomId, templateId);
  await client.query(
    `UPDATE public.rooms SET meta = jsonb_build_object('proof_tag', $2::text, 'source', 'proof_fixture')
     WHERE id = $1`,
    [sourceRoomId, TAG]
  );
  await client.query(
    `UPDATE public.rooms SET status = 'playing'::public.room_status, updated_at = now()
     WHERE id = $1`,
    [sourceRoomId]
  );
  const rows = await q<{ fn_auto_buy_get_or_create_serial_successor: string }>(
    client,
    `SELECT game_core.fn_auto_buy_get_or_create_serial_successor($1) AS fn_auto_buy_get_or_create_serial_successor`,
    [sourceRoomId]
  );
  const roomId = rows[0]?.fn_auto_buy_get_or_create_serial_successor;
  const mode = roomId ? await modeForRoom(client, roomId) : null;
  record("fn_auto_buy_get_or_create_serial_successor", flag, expected, mode, roomId ?? "no room");
  if (roomId) {
    await client.query(
      `UPDATE public.rooms SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('proof_tag', $2::text)
       WHERE id = $1`,
      [roomId, TAG]
    );
    await client.query(
      `UPDATE public.rooms SET meta = meta - 'serial_successor_room_id' WHERE id = $1`,
      [sourceRoomId]
    );
    await execRequired(client, "delete-serial-successor-room", `DELETE FROM public.rooms WHERE id = $1`, [
      roomId,
    ]);
  }
  await execRequired(
    client,
    "cancel-serial-source-room",
    `UPDATE public.rooms SET status = 'cancelled'::public.room_status, updated_at = now() WHERE id = $1`,
    [sourceRoomId]
  );
}

async function testTournamentRound(client: pg.Client, flag: boolean, poolId: string): Promise<void> {
  const expected = flag ? "room_level" : "per_draw";
  await setFlag(client, flag);
  await execRequired(
    client,
    "reset-tournament-assignments",
    `DELETE FROM public.tournament_round_assignments WHERE tournament_id = $1`,
    [TOURNAMENT_ID]
  );
  await execRequired(
    client,
    "reset-tournament-round-rooms",
    `DELETE FROM public.tournament_round_rooms WHERE tournament_id = $1`,
    [TOURNAMENT_ID]
  );
  await execRequired(
    client,
    "reset-tournament",
    `DELETE FROM public.tournaments WHERE id = $1`,
    [TOURNAMENT_ID]
  );

  await client.query(
    `INSERT INTO public.tournaments (
       id, title, status, ticket_price, currency, max_tickets_per_player,
       table_size_mode, table_size_fixed, table_size_max, created_by, created_at, updated_at
     )
     VALUES ($1, $2, 'draft', 0, 'IRR', 1, 'fixed', 4, 12, $3, now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [TOURNAMENT_ID, `${TAG} tournament`, USER_A]
  );
  await client.query(
    `INSERT INTO public.tournament_round_rooms (
       id, tournament_id, round_no, table_no, created_at, updated_at
     )
     VALUES ($1, $2, 1, 1, now(), now())
     ON CONFLICT (id) DO UPDATE SET room_id = NULL, updated_at = now()`,
    [TRR_ID, TOURNAMENT_ID]
  );
  await client.query(
    `INSERT INTO public.tournament_round_assignments (
       tournament_id, round_no, trr_id, room_id, user_id, cards_count, created_at
     )
     VALUES ($1, 1, $2, $2, $3, 2, now())
     ON CONFLICT DO NOTHING`,
    [TOURNAMENT_ID, TRR_ID, USER_A]
  );

  await client.query(`SELECT tournament.fn_create_rooms_for_round($1, 1, $2)`, [
    TOURNAMENT_ID,
    poolId,
  ]);

  const rows = await q<{ room_id: string; ding_settle_mode: string }>(
    client,
    `SELECT trr.room_id, r.ding_settle_mode
     FROM public.tournament_round_rooms trr
     JOIN public.rooms r ON r.id = trr.room_id
     WHERE trr.id = $1`,
    [TRR_ID]
  );
  const roomId = rows[0]?.room_id;
  const mode = rows[0]?.ding_settle_mode ?? null;
  record("tournament.fn_create_rooms_for_round", flag, expected, mode, roomId ?? "no room");
  if (roomId) {
    await client.query(
      `UPDATE public.rooms SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('proof_tag', $2::text)
       WHERE id = $1`,
      [roomId, TAG]
    );
  }
}

async function verifyLiveFunctions(client: pg.Client): Promise<void> {
  const fns = [
    "game_core.fn_join_or_create_room_core(uuid,integer,text)",
    "game_core.fn_system_join_or_create_room(uuid,uuid,integer,text)",
    "game_core.fn_auto_buy_get_or_create_serial_successor(uuid)",
    "tournament.fn_create_rooms_for_round(uuid,integer,uuid)",
    "public.load_test_seed_playing_rooms(integer,integer,integer,text)",
  ];
  for (const fn of fns) {
    const rows = await q<{ uses_resolver: boolean }>(
      client,
      `SELECT pg_get_functiondef($1::regprocedure) LIKE '%fn_resolve_ding_settle_mode_for_new_room%' AS uses_resolver`,
      [fn]
    );
    const pass = rows[0]?.uses_resolver === true;
    checks.push({
      path: `sql:${fn}`,
      flag: true,
      expected: "room_level",
      actual: pass ? "resolver_present" : "missing",
      pass,
      detail: "static function body check",
    });
  }
}

function printResults(): number {
  const failed = checks.filter((c) => !c.pass);
  console.log("Room creation ding_settle_mode regression proofs\n");
  for (const c of checks) {
    console.log(
      `${c.pass ? "PASS" : "FAIL"} | ${c.path} | flag=${c.flag} | expected=${c.expected} | actual=${c.actual}${c.detail ? ` | ${c.detail}` : ""}`
    );
  }
  console.log(`\nTOTAL: ${checks.length} checks, ${failed.length} failed`);
  console.log(failed.length === 0 ? "ROOM_CREATION_DING_STAMP = yes" : "ROOM_CREATION_DING_STAMP = no");
  return failed.length;
}

async function main(): Promise<void> {
  assertSafeDatabase(DB!);
  const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let savedFlag = false;
  let flagLoaded = false;
  let cleanupError: Error | null = null;
  let runError: unknown = null;

  try {
    await acquireLock(client);
    const flagRow = await q<{ ding_room_settle_enabled: boolean }>(
      client,
      `SELECT ding_room_settle_enabled FROM public.app_runtime_flags WHERE id = true`
    );
    savedFlag = flagRow[0]?.ding_room_settle_enabled ?? false;
    flagLoaded = true;

    const poolRows = await q<{ id: string }>(
      client,
      `SELECT id FROM public.card_pools WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    const poolId = poolRows[0]?.id;
    if (!poolId) throw new Error("no active card pool");

    await cleanup(client);
    await insertProofTemplate(client, TEMPLATE_JOIN_TRUE, `${TAG} join true`);
    await insertProofTemplate(client, TEMPLATE_JOIN_FALSE, `${TAG} join false`);
    await insertProofTemplate(client, TEMPLATE_SYSTEM_TRUE, `${TAG} system true`);
    await insertProofTemplate(client, TEMPLATE_SYSTEM_FALSE, `${TAG} system false`);
    await assertNotVisibleInLobby(client, "after-insert");

    await verifyLiveFunctions(client);

    await testSystemJoinOrCreate(client, true, TEMPLATE_SYSTEM_TRUE);
    await testSystemJoinOrCreate(client, false, TEMPLATE_SYSTEM_FALSE);
    await assertNotVisibleInLobby(client, "after-system-join");
    await testSerialSuccessor(client, true, poolId, SOURCE_ROOM_TRUE, TEMPLATE_SERIAL_TRUE);
    await testSerialSuccessor(client, false, poolId, SOURCE_ROOM_FALSE, TEMPLATE_SERIAL_FALSE);
    await assertNotVisibleInLobby(client, "after-serial");
    await testTournamentRound(client, true, poolId);
    await testTournamentRound(client, false, poolId);
    await assertNotVisibleInLobby(client, "after-tournament");
  } catch (err) {
    runError = err;
    console.error(`[${TAG}] run failed`, err);
  } finally {
    try {
      if (flagLoaded) {
        await setFlag(client, savedFlag);
      }
    } catch (err) {
      console.error(`[${TAG}] failed to restore ding_room_settle_enabled`, err);
      cleanupError =
        err instanceof Error ? err : new Error("failed to restore ding_room_settle_enabled");
    }
    try {
      await cleanup(client);
      await assertNotVisibleInLobby(client, "after-cleanup");
    } catch (err) {
      console.error(`[${TAG}] cleanup/finally failed`, err);
      cleanupError = err instanceof Error ? err : new Error(String(err));
    }
    try {
      await client.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
    } catch (err) {
      console.error(`[${TAG}] advisory unlock failed`, err);
    }
    await client.end();
  }

  const failedCount = printResults();
  if (cleanupError) {
    console.error(`[${TAG}] CLEANUP_FAILED`);
    process.exit(2);
  }
  if (runError) {
    process.exit(2);
  }
  process.exit(failedCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
