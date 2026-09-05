#!/usr/bin/env node
/**
 * R8A regression: every live room INSERT path stamps gameplay_persist_mode via
 * fn_resolve_gameplay_persist_mode_for_new_room() — not column DEFAULT alone.
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

const LOCK_KEY = 61005150001;
const TAG = "RLGCREATE";
const USER_A = "13c5deb7-10d5-46e8-88f0-0f4a2ac0fabd";
const SOURCE_ROOM_TRUE = "eeeeeeee-eeee-eeee-eeee-000000000031";
const SOURCE_ROOM_FALSE = "eeeeeeee-eeee-eeee-eeee-000000000032";
const TEMPLATE_SERIAL_TRUE = "eeeeeeee-eeee-eeee-eeee-000000000041";
const TEMPLATE_SERIAL_FALSE = "eeeeeeee-eeee-eeee-eeee-000000000042";
const TOURNAMENT_ID = "eeeeeeee-eeee-eeee-eeee-000000000003";
const TRR_ID = "eeeeeeee-eeee-eeee-eeee-000000000004";
const TEMPLATE_SYSTEM_TRUE = "eeeeeeee-eeee-eeee-eeee-000000000011";
const TEMPLATE_SYSTEM_FALSE = "eeeeeeee-eeee-eeee-eeee-000000000012";
const TEMPLATE_JOIN_TRUE = "eeeeeeee-eeee-eeee-eeee-000000000021";
const TEMPLATE_JOIN_FALSE = "eeeeeeee-eeee-eeee-eeee-000000000022";

const LIVE_INSERT_FNS = [
  "game_core.fn_join_or_create_room_core(uuid,integer,text)",
  "game_core.fn_system_join_or_create_room(uuid,uuid,integer,text)",
  "game_core.fn_auto_buy_get_or_create_serial_successor(uuid)",
  "tournament.fn_create_rooms_for_round(uuid,integer,uuid)",
  "public.load_test_seed_playing_rooms(integer,integer,integer,text)",
] as const;

const PROOF_TEMPLATE_IDS = [
  TEMPLATE_SYSTEM_TRUE,
  TEMPLATE_SYSTEM_FALSE,
  TEMPLATE_JOIN_TRUE,
  TEMPLATE_JOIN_FALSE,
  TEMPLATE_SERIAL_TRUE,
  TEMPLATE_SERIAL_FALSE,
] as const;

const FIXTURE_ROOM_TYPE = "tournament";
const FIXTURE_STATUS = "active";
const FIXTURE_PRICE = 0;
const UNSAFE_LIVE_OVERRIDE = "RLGCREATE_UNSAFE_LIVE_DB";

type ExpectedMode = "manifest_ram" | "per_draw";

interface Check {
  path: string;
  flag: boolean;
  expected: ExpectedMode;
  actual: string | null;
  pass: boolean;
  detail?: string;
}

const checks: Check[] = [];

function isLiveLikeDatabase(connectionString: string): boolean {
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname.toLowerCase();
    return !(
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "postgres" ||
      host === "db" ||
      host.endsWith(".local")
    );
  } catch {
    return true;
  }
}

function assertSafeDatabase(connectionString: string): void {
  if (!isLiveLikeDatabase(connectionString)) return;
  if (process.env[UNSAFE_LIVE_OVERRIDE] === "1") {
    console.warn(`[${TAG}] UNSAFE override enabled — fixtures stay tournament-only.`);
    return;
  }
  console.error(`[${TAG}] Refusing live-like DB without ${UNSAFE_LIVE_OVERRIDE}=1`);
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
    throw new Error(`[${TAG}] failed at ${label}: ${message}`);
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

async function setManifestRamFlag(client: pg.Client, enabled: boolean): Promise<void> {
  await client.query(
    `UPDATE public.app_runtime_flags
     SET gameplay_manifest_ram_enabled = $1, updated_at = now()
     WHERE id = true`,
    [enabled]
  );
}

async function setAuthContext(
  client: pg.Client,
  userId: string,
  role: "authenticated" | "service_role"
): Promise<void> {
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role }),
  ]);
}

const PROOF_ROOM_MATCH = `
  meta->>'proof_tag' = $1
  OR id = ANY($2::uuid[])
  OR room_template_id = ANY($3::uuid[])
`;

async function cleanup(client: pg.Client): Promise<void> {
  await client.query(`SET lock_timeout = '8s'`);
  await execRequired(
    client,
    "deactivate-proof-templates",
    `UPDATE public.room_templates
     SET status = 'inactive'::public.room_template_status,
         room_type = 'tournament'::public.room_type,
         updated_at = now()
     WHERE id = ANY($1::uuid[]) AND name LIKE $2`,
    [PROOF_TEMPLATE_IDS, `${TAG}%`]
  );
  await execRequired(
    client,
    "delete-tournament-assignments",
    `DELETE FROM public.tournament_round_assignments WHERE tournament_id = $1`,
    [TOURNAMENT_ID]
  );
  await execRequired(
    client,
    "delete-tournament-round-rooms",
    `DELETE FROM public.tournament_round_rooms WHERE tournament_id = $1`,
    [TOURNAMENT_ID]
  );
  await execRequired(
    client,
    "delete-tournament",
    `DELETE FROM public.tournaments WHERE id = $1`,
    [TOURNAMENT_ID]
  );
  await execRequired(
    client,
    "cancel-proof-rooms",
    `UPDATE public.rooms SET status = 'cancelled'::public.room_status, updated_at = now()
     WHERE ${PROOF_ROOM_MATCH}`,
    [TAG, [SOURCE_ROOM_TRUE, SOURCE_ROOM_FALSE], PROOF_TEMPLATE_IDS]
  );
  await execRequired(
    client,
    "delete-proof-tickets",
    `DELETE FROM public.tickets WHERE room_id IN (
       SELECT id FROM public.rooms WHERE ${PROOF_ROOM_MATCH}
     )`,
    [TAG, [SOURCE_ROOM_TRUE, SOURCE_ROOM_FALSE], PROOF_TEMPLATE_IDS]
  );
  await execRequired(
    client,
    "delete-proof-rooms",
    `DELETE FROM public.rooms WHERE ${PROOF_ROOM_MATCH}`,
    [TAG, [SOURCE_ROOM_TRUE, SOURCE_ROOM_FALSE], PROOF_TEMPLATE_IDS]
  );
  await client.query(
    `DELETE FROM public.room_templates WHERE id = ANY($1::uuid[]) AND name LIKE $2`,
    [PROOF_TEMPLATE_IDS, `${TAG}%`]
  );
}

async function insertProofTemplate(
  client: pg.Client,
  templateId: string,
  label: string
): Promise<void> {
  await client.query(
    `INSERT INTO public.room_templates (
       id, name, price, currency, min_players, max_cards_per_player,
       countdown_sec, room_type, status, created_at, updated_at
     )
     VALUES ($1, $2, $3, 'IRR', 2, 10, 120, $4::public.room_type, $5::public.room_template_status, now(), now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, price = EXCLUDED.price, room_type = EXCLUDED.room_type,
       status = EXCLUDED.status, updated_at = now()`,
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
       room_seed, room_seed_hash, waiting_started_at,
       ding_settle_mode, gameplay_persist_mode, meta, created_at, updated_at
     )
     SELECT $1, $2, 'waiting', 0, 'IRR', $3, 2, 10, 120,
            seed, seed_hash, now(), 'per_draw', 'per_draw',
            jsonb_build_object('proof_tag', $4::text, 'source', 'proof_fixture'),
            now(), now()
     FROM game_core.fn_generate_room_seed()
     ON CONFLICT (id) DO UPDATE SET room_template_id = EXCLUDED.room_template_id, meta = EXCLUDED.meta, updated_at = now()`,
    [sourceRoomId, templateId, poolId, TAG]
  );
}

function record(
  path: string,
  flag: boolean,
  expected: ExpectedMode,
  actual: string | null,
  detail?: string
): void {
  checks.push({ path, flag, expected, actual, pass: actual === expected, detail });
}

async function modeForRoom(client: pg.Client, roomId: string): Promise<string | null> {
  const rows = await q<{ gameplay_persist_mode: string }>(
    client,
    `SELECT gameplay_persist_mode FROM public.rooms WHERE id = $1`,
    [roomId]
  );
  return rows[0]?.gameplay_persist_mode ?? null;
}

async function tagProofRoom(client: pg.Client, roomId: string): Promise<void> {
  await client.query(
    `UPDATE public.rooms SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('proof_tag', $2::text) WHERE id = $1`,
    [roomId, TAG]
  );
}

async function deleteWaitingOnTemplate(client: pg.Client, templateId: string): Promise<void> {
  await execRequired(
    client,
    "delete-tickets-before-join",
    `DELETE FROM public.tickets WHERE room_id IN (
       SELECT id FROM public.rooms WHERE room_template_id = $1 AND status = 'waiting'
     )`,
    [templateId]
  );
  await execRequired(
    client,
    "delete-waiting-before-join",
    `DELETE FROM public.rooms WHERE room_template_id = $1 AND status = 'waiting'`,
    [templateId]
  );
}

async function testPlayerJoin(
  client: pg.Client,
  flag: boolean,
  templateId: string
): Promise<void> {
  const expected: ExpectedMode = flag ? "manifest_ram" : "per_draw";
  await setManifestRamFlag(client, flag);
  await setAuthContext(client, USER_A, "authenticated");
  await insertProofTemplate(client, templateId, `${TAG} player ${flag ? "on" : "off"}`);
  await deleteWaitingOnTemplate(client, templateId);
  const rows = await q<{ room_id: string }>(
    client,
    `SELECT room_id FROM game_core.fn_join_or_create_room_core($1, 1, NULL) LIMIT 1`,
    [templateId]
  );
  const roomId = rows[0]?.room_id;
  const mode = roomId ? await modeForRoom(client, roomId) : null;
  record("fn_join_or_create_room_core", flag, expected, mode, roomId ?? "no room");
  if (roomId) await tagProofRoom(client, roomId);
}

async function testSystemJoin(
  client: pg.Client,
  flag: boolean,
  templateId: string
): Promise<void> {
  const expected: ExpectedMode = flag ? "manifest_ram" : "per_draw";
  await setManifestRamFlag(client, flag);
  await setAuthContext(client, USER_A, "service_role");
  await insertProofTemplate(client, templateId, `${TAG} system ${flag ? "on" : "off"}`);
  await deleteWaitingOnTemplate(client, templateId);
  const rows = await q<{ room_id: string }>(
    client,
    `SELECT room_id FROM game_core.fn_system_join_or_create_room($1, $2, 1, NULL) LIMIT 1`,
    [USER_A, templateId]
  );
  const roomId = rows[0]?.room_id;
  const mode = roomId ? await modeForRoom(client, roomId) : null;
  record("fn_system_join_or_create_room", flag, expected, mode, roomId ?? "no room");
  if (roomId) await tagProofRoom(client, roomId);
}

async function testSerialSuccessor(
  client: pg.Client,
  flag: boolean,
  poolId: string,
  sourceRoomId: string,
  templateId: string
): Promise<void> {
  const expected: ExpectedMode = flag ? "manifest_ram" : "per_draw";
  await setManifestRamFlag(client, flag);
  await ensureSourceRoom(client, poolId, sourceRoomId, templateId);
  await client.query(
    `UPDATE public.rooms SET status = 'playing'::public.room_status, updated_at = now() WHERE id = $1`,
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
    await tagProofRoom(client, roomId);
    await execRequired(client, "delete-serial-successor", `DELETE FROM public.rooms WHERE id = $1`, [roomId]);
  }
  await execRequired(
    client,
    "cancel-serial-source",
    `UPDATE public.rooms SET status = 'cancelled'::public.room_status, updated_at = now() WHERE id = $1`,
    [sourceRoomId]
  );
}

async function testTournamentRound(client: pg.Client, flag: boolean, poolId: string): Promise<void> {
  const expected: ExpectedMode = flag ? "manifest_ram" : "per_draw";
  await setManifestRamFlag(client, flag);
  await execRequired(client, "reset-trr", `DELETE FROM public.tournament_round_assignments WHERE tournament_id = $1`, [TOURNAMENT_ID]);
  await execRequired(client, "reset-trr-rooms", `DELETE FROM public.tournament_round_rooms WHERE tournament_id = $1`, [TOURNAMENT_ID]);
  await execRequired(client, "reset-tournament", `DELETE FROM public.tournaments WHERE id = $1`, [TOURNAMENT_ID]);
  await client.query(
    `INSERT INTO public.tournaments (
       id, title, status, ticket_price, currency, max_tickets_per_player,
       table_size_mode, table_size_fixed, table_size_max, created_by, created_at, updated_at
     ) VALUES ($1, $2, 'draft', 0, 'IRR', 1, 'fixed', 4, 12, $3, now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [TOURNAMENT_ID, `${TAG} tournament`, USER_A]
  );
  await client.query(
    `INSERT INTO public.tournament_round_rooms (id, tournament_id, round_no, table_no, created_at, updated_at)
     VALUES ($1, $2, 1, 1, now(), now())
     ON CONFLICT (id) DO UPDATE SET room_id = NULL, updated_at = now()`,
    [TRR_ID, TOURNAMENT_ID]
  );
  await client.query(
    `INSERT INTO public.tournament_round_assignments (tournament_id, round_no, trr_id, room_id, user_id, cards_count, created_at)
     VALUES ($1, 1, $2, $2, $3, 2, now()) ON CONFLICT DO NOTHING`,
    [TOURNAMENT_ID, TRR_ID, USER_A]
  );
  await client.query(`SELECT tournament.fn_create_rooms_for_round($1, 1, $2)`, [TOURNAMENT_ID, poolId]);
  const rows = await q<{ room_id: string; gameplay_persist_mode: string }>(
    client,
    `SELECT trr.room_id, r.gameplay_persist_mode
     FROM public.tournament_round_rooms trr
     JOIN public.rooms r ON r.id = trr.room_id
     WHERE trr.id = $1`,
    [TRR_ID]
  );
  const roomId = rows[0]?.room_id;
  const mode = rows[0]?.gameplay_persist_mode ?? null;
  record("tournament.fn_create_rooms_for_round", flag, expected, mode, roomId ?? "no room");
  if (roomId) await tagProofRoom(client, roomId);
}

async function verifyLiveFunctions(client: pg.Client): Promise<string[]> {
  const unpatched: string[] = [];
  for (const fn of LIVE_INSERT_FNS) {
    const rows = await q<{ uses_resolver: boolean; has_insert: boolean }>(
      client,
      `SELECT
         pg_get_functiondef($1::regprocedure) LIKE '%fn_resolve_gameplay_persist_mode_for_new_room%' AS uses_resolver,
         pg_get_functiondef($1::regprocedure) ILIKE '%INSERT INTO%rooms%' AS has_insert`,
      [fn]
    );
    const row = rows[0];
    const pass = row?.has_insert ? row.uses_resolver === true : true;
    checks.push({
      path: `sql:${fn}`,
      flag: true,
      expected: "manifest_ram",
      actual: pass ? "resolver_present" : "missing",
      pass,
      detail: "static function body check",
    });
    if (!pass) unpatched.push(fn);
  }
  return unpatched;
}

function summarizePath(pathPrefix: string): "pass" | "fail" {
  const related = checks.filter((c) => c.path.startsWith(pathPrefix) && !c.path.startsWith("sql:"));
  return related.length > 0 && related.every((c) => c.pass) ? "pass" : "fail";
}

function printResults(): number {
  const failed = checks.filter((c) => !c.pass);
  console.log("R8A room creation gameplay_persist_mode proofs\n");
  for (const c of checks) {
    console.log(
      `${c.pass ? "PASS" : "FAIL"} | ${c.path} | flag=${c.flag} | expected=${c.expected} | actual=${c.actual}${c.detail ? ` | ${c.detail}` : ""}`
    );
  }
  console.log(`\nTOTAL: ${checks.length} checks, ${failed.length} failed`);
  return failed.length;
}

async function main(): Promise<void> {
  assertSafeDatabase(DB!);
  const client = new pg.Client({ connectionString: DB!, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let savedFlag = true;
  let flagLoaded = false;
  let unpatched: string[] = [];
  let cleanupError: Error | null = null;
  let runError: unknown = null;

  try {
    await acquireLock(client);
    const flagRow = await q<{ gameplay_manifest_ram_enabled: boolean }>(
      client,
      `SELECT gameplay_manifest_ram_enabled FROM public.app_runtime_flags WHERE id = true`
    );
    savedFlag = flagRow[0]?.gameplay_manifest_ram_enabled ?? false;
    flagLoaded = true;

    const mig = await q<{ inserted_at: string }>(
      client,
      `SELECT inserted_at::text
       FROM supabase_migrations.schema_migrations
       WHERE version = '20260905150000'
       LIMIT 1`
    );
    const patchTs = mig[0]?.inserted_at ?? new Date().toISOString();

    const poolRows = await q<{ id: string }>(
      client,
      `SELECT id FROM public.card_pools WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    const poolId = poolRows[0]?.id;
    if (!poolId) throw new Error("no active card pool");

    await cleanup(client);
    unpatched = await verifyLiveFunctions(client);

    await testPlayerJoin(client, true, TEMPLATE_JOIN_TRUE);
    await testPlayerJoin(client, false, TEMPLATE_JOIN_FALSE);
    await testSystemJoin(client, true, TEMPLATE_SYSTEM_TRUE);
    await testSystemJoin(client, false, TEMPLATE_SYSTEM_FALSE);
    await testSerialSuccessor(client, true, poolId, SOURCE_ROOM_TRUE, TEMPLATE_SERIAL_TRUE);
    await testSerialSuccessor(client, false, poolId, SOURCE_ROOM_FALSE, TEMPLATE_SERIAL_FALSE);
    await testTournamentRound(client, true, poolId);
    await testTournamentRound(client, false, poolId);

    const flagOnChecks = checks.filter((c) => c.flag === true && !c.path.startsWith("sql:"));
    const flagOffChecks = checks.filter((c) => c.flag === false && !c.path.startsWith("sql:"));
    const flagOnOk = flagOnChecks.every((c) => c.pass && c.expected === "manifest_ram");
    const flagOffOk = flagOffChecks.every((c) => c.pass && c.expected === "per_draw");

    const postPatch = await q<{ cnt: string }>(
      client,
      `SELECT COUNT(*)::text AS cnt FROM public.rooms
       WHERE gameplay_persist_mode = 'per_draw'
         AND created_at >= $1::timestamptz
         AND COALESCE(meta->>'proof_tag', '') <> $2`,
      [patchTs, TAG]
    );

    const activePd = await q<Record<string, string>>(
      client,
      `SELECT
         COUNT(*) FILTER (WHERE gameplay_persist_mode='per_draw' AND status='waiting')::text AS pd_waiting,
         COUNT(*) FILTER (WHERE gameplay_persist_mode='per_draw' AND status='playing')::text AS pd_playing,
         COUNT(*) FILTER (WHERE gameplay_persist_mode='per_draw' AND status='settling')::text AS pd_settling,
         game_core.fn_resolve_gameplay_persist_mode_for_new_room() AS resolver
       FROM public.rooms`
    );

    const complete = unpatched.length === 0 && flagOnOk && flagOffOk;

    console.log("\n--- R8A SUMMARY ---");
    console.log(`ROOM_INSERT_PATHS_TOTAL = ${LIVE_INSERT_FNS.length}`);
    console.log(`ROOM_INSERT_PATHS_PATCHED = ${LIVE_INSERT_FNS.length - unpatched.length}`);
    console.log(`UNPATCHED_ROOM_INSERT_PATHS = ${unpatched.length ? unpatched.join(", ") : "(none)"}`);
    console.log(`PLAYER_JOIN_STAMP = ${summarizePath("fn_join_or_create_room_core")}`);
    console.log(`SYSTEM_JOIN_STAMP = ${summarizePath("fn_system_join_or_create_room")}`);
    console.log(`AUTO_BUY_STAMP = ${summarizePath("fn_auto_buy")}`);
    console.log(`TOURNAMENT_STAMP = ${summarizePath("tournament.fn_create_rooms_for_round")}`);
    console.log(`DEV_LOADTEST_STAMP = ${unpatched.some((f) => f.includes("load_test")) ? "fail" : "pass"}`);
    console.log(`FLAG_ON_ALL_PATHS_MANIFEST_RAM = ${flagOnOk ? "yes" : "no"}`);
    console.log(`FLAG_OFF_ALL_PATHS_PER_DRAW = ${flagOffOk ? "yes" : "no"}`);
    console.log(`NEW_PER_DRAW_AFTER_PATCH = ${postPatch[0]?.cnt ?? "?"}`);
    console.log(`resolver = ${activePd[0]?.resolver ?? "?"}`);
    console.log(
      `active per_draw waiting/playing/settling = ${activePd[0]?.pd_waiting}/${activePd[0]?.pd_playing}/${activePd[0]?.pd_settling}`
    );
    console.log(`R8A_CREATION_CUTOVER_COMPLETE = ${complete ? "yes" : "no"}`);
    console.log(`R8_LEGACY_RETIREMENT_READY = no`);
  } catch (err) {
    runError = err;
    console.error(`[${TAG}] run failed`, err);
  } finally {
    try {
      if (flagLoaded) await setManifestRamFlag(client, savedFlag);
    } catch (err) {
      cleanupError = err instanceof Error ? err : new Error(String(err));
    }
    try {
      await cleanup(client);
    } catch (err) {
      cleanupError = err instanceof Error ? err : new Error(String(err));
    }
    try {
      await client.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
    } catch {
      // ignore
    }
    await client.end();
  }

  const failedCount = printResults();
  if (cleanupError) {
    console.error(`[${TAG}] CLEANUP_FAILED`);
    process.exit(2);
  }
  if (runError) process.exit(2);
  process.exit(failedCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
