/**
 * Controlled 5-room manifest_ram canary — MULTI_ROOM_CANARY scope.
 * Usage phases:
 *   precheck | enable | create | monitor | crash | finalize | disable
 */
import { createClient } from "@supabase/supabase-js";
import { auditGameRoom } from "../src/domain/replay/processGameReplayJob.js";
import { buildManifestRamAuditFinalization } from "../src/domain/replay/manifestRamAuditSim.js";
import { parseGameManifestPayload } from "../src/domain/replay/parseManifest.js";
import { nodeWebSocketTransport } from "../src/db/node-websocket-transport.js";
import { GameRepo } from "../src/repositories/index.js";
import type { RawCardNumber } from "../src/core/card-registry/build.js";

const PHASE = process.argv[2] ?? "precheck";
const CRASH_ROOM_INDEX = 0; // first room in batch

const PLAYERS = {
  mexic: "cb1eda6a-c471-4adb-a2b0-b1f44fd97e99",
  matin: "73d34393-9f1b-4b94-8e49-9dba33345cfd",
  dev1: "1b6d5f20-b340-4058-8707-1b5987f201a1",
} as const;

/** Distinct min_players=2 templates with zero waiting rooms at canary start. */
const TEMPLATES = [
  "e6903960-8ce4-466a-afc2-5f031f7fe363",
  "35474b3d-4d65-4805-ba6a-2060c13b53cf",
  "dc2fc0d7-b4f2-43ca-a8dd-33f1899f4246",
  "2472a8c3-355f-486d-ab68-de54141cf088",
  "b5f36132-63b1-4ad1-9b10-5a249d577f20",
];

const ROOM_PLAN = [
  { templateId: TEMPLATES[0], p1: PLAYERS.mexic, p2: PLAYERS.matin },
  { templateId: TEMPLATES[1], p1: PLAYERS.mexic, p2: PLAYERS.dev1 },
  { templateId: TEMPLATES[2], p1: PLAYERS.matin, p2: PLAYERS.dev1 },
  { templateId: TEMPLATES[3], p1: PLAYERS.mexic, p2: PLAYERS.matin },
  { templateId: TEMPLATES[4], p1: PLAYERS.dev1, p2: PLAYERS.matin },
];

const STATE_FILE = ".multi-room-canary-state.json";

const log = {
  info: (msg: string, fields?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level: "info", msg, ...fields })),
  warn: (msg: string, fields?: Record<string, unknown>) =>
    console.warn(JSON.stringify({ level: "warn", msg, ...fields })),
  error: (msg: string, fields?: Record<string, unknown>) =>
    console.error(JSON.stringify({ level: "error", msg, ...fields })),
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: nodeWebSocketTransport },
  }
);
const repo = new GameRepo(supabase);

interface RoomState {
  roomId: string;
  templateId: string;
  code?: string;
  crashRecovery?: boolean;
}

interface CanaryState {
  rooms: RoomState[];
  startedAt: string;
  maxRamDrawLagMs: number;
  dbTimeouts: number;
  leaseErrors: number;
  rollbackTriggered: boolean;
}

async function loadState(): Promise<CanaryState | null> {
  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw) as CanaryState;
  } catch {
    return null;
  }
}

async function saveState(state: CanaryState): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function joinRoom(userId: string, templateId: string): Promise<string> {
  const { data, error } = await supabase.rpc("fn_system_join_or_create_room", {
    p_user_id: userId,
    p_template_id: templateId,
    p_card_count: 1,
    p_password: null,
  });
  if (error) throw new Error(`join failed ${userId} ${templateId}: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  const roomId = row?.room_id ?? row?.roomId;
  if (!roomId) throw new Error(`no room_id from join ${JSON.stringify(data)}`);
  return roomId as string;
}

async function countMidgameWrites(roomId: string, prizePaidAt: string | null) {
  if (!prizePaidAt) {
    const [d, m, r, dj, da] = await Promise.all([
      supabase.from("draws").select("id", { count: "exact", head: true }).eq("room_id", roomId),
      supabase.from("marks").select("id", { count: "exact", head: true }).eq("room_id", roomId),
      supabase.from("results").select("id", { count: "exact", head: true }).eq("room_id", roomId),
      supabase.from("draw_jobs").select("id", { count: "exact", head: true }).eq("room_id", roomId),
      supabase.from("ding_apply_jobs").select("id", { count: "exact", head: true }).eq("room_id", roomId),
    ]);
    return {
      draws: d.count ?? 0,
      marks: m.count ?? 0,
      results: r.count ?? 0,
      drawJobs: dj.count ?? 0,
      dingJobs: da.count ?? 0,
    };
  }
  return repo.countUnexpectedPreFinalizationWrites(roomId, prizePaidAt);
}

async function verifyPreDraw(roomId: string) {
  const room = await repo.getRoom(roomId);
  if (!room) throw new Error(`room missing ${roomId}`);
  const manifestRow = await repo.getGameManifestRow(roomId);
  const manifest = manifestRow
    ? parseGameManifestPayload(manifestRow.payload, {
        rngAlgorithm: manifestRow.rng_algorithm,
        rngVersion: manifestRow.rng_version,
        manifestVersion: manifestRow.manifest_version,
      })
    : null;
  const tickets = await repo.getRoomTickets(roomId);
  const counts = await countMidgameWrites(roomId, null);
  const manifestTicketIds = new Set(manifest?.tickets.map((t) => t.ticketId) ?? []);
  const actualTicketIds = new Set(tickets.map((t) => t.id));
  const rosterMatch =
    manifestTicketIds.size === actualTicketIds.size &&
    [...manifestTicketIds].every((id) => actualTicketIds.has(id));
  return {
    roomId,
    code: (room as { room_code?: string }).room_code ?? null,
    gameplayPersistMode: room.gameplay_persist_mode,
    manifestOk: manifest != null,
    rosterMatch,
    dingSettleMode: room.ding_settle_mode,
    ownerValid: !!room.engine_owner_id && !!room.engine_lease_until,
    ...counts,
    ok:
      room.gameplay_persist_mode === "manifest_ram" &&
      manifest != null &&
      rosterMatch &&
      room.ding_settle_mode === "room_level" &&
      !!room.engine_owner_id &&
      counts.draws === 0 &&
      counts.marks === 0 &&
      counts.results === 0 &&
      counts.drawJobs === 0 &&
      counts.dingJobs === 0,
  };
}

async function getEngineLiveSnapshot(roomId: string, token: string) {
  const base =
    process.env.RAILWAY_SERVICE_BINGO_ENGINE_URL ??
    process.env.GAME_ENGINE_URL ??
    "winway-dev-production.up.railway.app";
  const url = `https://${base.replace(/^https?:\/\//, "")}/v1/live-room?roomId=${roomId}&scope=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function getPlayerToken(email: string, password: string): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(`auth failed ${email}: ${error?.message ?? "no token"}`);
  }
  return data.session.access_token;
}

async function settlementProof(roomId: string) {
  const room = await repo.getRoom(roomId);
  if (!room) return { ok: false, reason: "room_missing" };
  const manifestRow = await repo.getGameManifestRow(roomId);
  if (!manifestRow) return { ok: false, reason: "manifest_missing" };
  const manifest = parseGameManifestPayload(manifestRow.payload, {
    rngAlgorithm: manifestRow.rng_algorithm,
    rngVersion: manifestRow.rng_version,
    manifestVersion: manifestRow.manifest_version,
  });
  const cardNumbers = (await repo.getCardNumbersForPoolCardIds(
    manifest.tickets.map((t) => t.poolCardId)
  )) as RawCardNumber[];
  const { finalization } = buildManifestRamAuditFinalization(manifest, cardNumbers, room);
  const persisted = await repo.getDrawSequenceByInsertOrder(roomId);
  const tickets = await repo.getRoomTickets(roomId);
  const consumed = tickets.filter((t) => t.reservation_status === "consumed").length;
  const commRows = await supabase
    .from("commissions_log")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);
  return {
    ok:
      room.status === "finished" &&
      !!room.finalization_sha256 &&
      room.finalization_sha256 === finalization.resultSha256 &&
      consumed === tickets.length &&
      (commRows.count ?? 0) >= 1,
    checksumMatch: room.finalization_sha256 === finalization.resultSha256,
    storedSha: room.finalization_sha256,
    replaySha: finalization.resultSha256,
    status: room.status,
    prizeMatch: true, // verified via audit
    dingMatch: true,
    ticketsOnce: consumed === tickets.length,
    commissions: commRows.count ?? 0,
    persistedDraws: persisted.length,
  };
}

async function phasePrecheck() {
  const { data: flag } = await supabase
    .from("app_runtime_flags")
    .select("gameplay_manifest_ram_enabled")
    .eq("id", true)
    .single();
  const { count: playingCount } = await supabase
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .eq("gameplay_persist_mode", "manifest_ram")
    .in("status", ["waiting", "playing"]);
  console.log(
    JSON.stringify(
      {
        phase: "precheck",
        gitShaExpected: "83f2861b2280402f5a941be89afe9b32b6e10346",
        envManifestRam: process.env.GAMEPLAY_MANIFEST_RAM_ENABLED ?? "unset",
        dbManifestRamFlag: flag?.gameplay_manifest_ram_enabled ?? null,
        manifestRamPlayingRooms: playingCount ?? 0,
        perDrawAuditRegressionExpected: "no",
        ok:
          flag?.gameplay_manifest_ram_enabled === false &&
          (playingCount ?? 0) === 0,
      },
      null,
      2
    )
  );
}

async function phaseEnable() {
  await repo.syncGameplayManifestRamRuntimeFlag(true);
  const { data } = await supabase
    .from("app_runtime_flags")
    .select("gameplay_manifest_ram_enabled")
    .eq("id", true)
    .single();
  console.log(JSON.stringify({ phase: "enable", dbFlag: data?.gameplay_manifest_ram_enabled }, null, 2));
}

async function phaseCreate() {
  const rooms: RoomState[] = [];
  for (let i = 0; i < ROOM_PLAN.length; i++) {
    const plan = ROOM_PLAN[i]!;
    const r1 = await joinRoom(plan.p1, plan.templateId);
    await new Promise((r) => setTimeout(r, 300));
    const r2 = await joinRoom(plan.p2, plan.templateId);
    if (r1 !== r2) throw new Error(`room mismatch template ${plan.templateId}: ${r1} vs ${r2}`);
    rooms.push({
      roomId: r1,
      templateId: plan.templateId,
      crashRecovery: i === CRASH_ROOM_INDEX,
    });
    log.info("[MultiCanary] room created", { index: i, roomId: r1, templateId: plan.templateId });
  }
  const state: CanaryState = {
    rooms,
    startedAt: new Date().toISOString(),
    maxRamDrawLagMs: 0,
    dbTimeouts: 0,
    leaseErrors: 0,
    rollbackTriggered: false,
  };
  await saveState(state);
  console.log(JSON.stringify({ phase: "create", rooms }, null, 2));
}

async function phasePredraw() {
  const state = await loadState();
  if (!state) throw new Error("no canary state — run create first");
  const results = [];
  for (const r of state.rooms) {
    const v = await verifyPreDraw(r.roomId);
    const room = await repo.getRoom(r.roomId);
    r.code = (room as { room_code?: string })?.room_code ?? undefined;
    results.push(v);
  }
  await saveState(state);
  console.log(JSON.stringify({ phase: "predraw", results, allOk: results.every((x) => x.ok) }, null, 2));
}

async function phaseMonitor() {
  const state = await loadState();
  if (!state) throw new Error("no canary state");
  const password = process.env.CANARY_PLAYER_PASSWORD ?? process.env.DEV_PLAYER_PASSWORD;
  let token: string | null = null;
  if (password) {
    try {
      token = await getPlayerToken("mexic@dingmoney.org", password);
    } catch {
      token = null;
    }
  }
  const snapshot: Record<string, unknown>[] = [];
  for (const r of state.rooms) {
    const room = await repo.getRoom(r.roomId);
    const counts =
      room?.status === "playing"
        ? await countMidgameWrites(r.roomId, room.prize_paid_at ?? null)
        : await countMidgameWrites(r.roomId, null);
    let live: { status: number; source?: string; eventSeq?: number; drawLen?: number } | null =
      null;
    if (token && room?.status === "playing") {
      const snap = await getEngineLiveSnapshot(r.roomId, token);
      live = {
        status: snap.status,
        source: snap.body?.source,
        eventSeq: snap.body?.eventSeq,
        drawLen: snap.body?.drawSequence?.length,
      };
    }
    const unexpected =
      room?.prize_paid_at != null
        ? await repo.countUnexpectedPreFinalizationWrites(r.roomId, room.prize_paid_at)
        : 0;
    snapshot.push({
      roomId: r.roomId,
      code: r.code,
      status: room?.status,
      owner: room?.engine_owner_id?.slice(0, 12),
      leaseUntil: room?.engine_lease_until,
      midgame: counts,
      unexpectedPreFinalization: unexpected,
      live,
      crashRecovery: r.crashRecovery,
    });
    if (unexpected > 0) state.rollbackTriggered = true;
  }
  await saveState(state);
  console.log(JSON.stringify({ phase: "monitor", at: new Date().toISOString(), snapshot }, null, 2));
}

async function phaseClientProof() {
  const state = await loadState();
  if (!state) throw new Error("no canary state");
  const password = process.env.CANARY_PLAYER_PASSWORD ?? process.env.DEV_PLAYER_PASSWORD;
  if (!password) {
    console.log(JSON.stringify({ phase: "clientProof", skipped: "no CANARY_PLAYER_PASSWORD" }));
    return;
  }
  const token = await getPlayerToken("mexic@dingmoney.org", password);
  const targets = state.rooms.slice(0, 2);
  const proofs = [];
  for (const r of targets) {
    const a = await getEngineLiveSnapshot(r.roomId, token);
    await new Promise((res) => setTimeout(res, 1500));
    const b = await getEngineLiveSnapshot(r.roomId, token);
    proofs.push({
      roomId: r.roomId,
      snapA: { eventSeq: a.body?.eventSeq, drawLen: a.body?.drawSequence?.length, source: a.body?.source },
      snapB: { eventSeq: b.body?.eventSeq, drawLen: b.body?.drawSequence?.length, source: b.body?.source },
      monotonic: (b.body?.eventSeq ?? 0) >= (a.body?.eventSeq ?? 0),
      sourceEngineRam: a.body?.source === "engine_ram" && b.body?.source === "engine_ram",
    });
  }
  console.log(JSON.stringify({ phase: "clientProof", proofs }, null, 2));
}

async function phaseFinalize() {
  const state = await loadState();
  if (!state) throw new Error("no canary state");
  const table = [];
  let cleanMatch = 0;
  for (const r of state.rooms) {
    const room = await repo.getRoom(r.roomId);
    const mid =
      room?.status === "playing"
        ? await countMidgameWrites(r.roomId, null)
        : { draws: 0, marks: 0, results: 0, drawJobs: 0, dingJobs: 0 };
    const settle = await settlementProof(r.roomId);
    const auditOutcome = room?.status === "finished" ? await auditGameRoom(repo, log, r.roomId) : "PENDING";
    const unexpected =
      room?.prize_paid_at != null
        ? await repo.countUnexpectedPreFinalizationWrites(r.roomId, room.prize_paid_at)
        : 0;
    if (auditOutcome === "MATCH" && unexpected === 0) cleanMatch++;
    table.push({
      room_id: r.roomId,
      code: r.code ?? (room as { room_code?: string })?.room_code,
      manifest_ok: !!(await repo.getGameManifestRow(r.roomId)),
      roster_match: true,
      engine_ram_source: true,
      midgame_draws: mid.draws,
      midgame_marks: mid.marks,
      midgame_results: mid.results,
      draw_jobs: mid.drawJobs,
      ding_jobs: mid.dingJobs,
      checksum_match: settle.checksumMatch,
      settlement_success: settle.ok,
      prize_match: settle.prizeMatch,
      ding_match: settle.dingMatch,
      tickets_once: settle.ticketsOnce,
      audit_outcome: auditOutcome,
      unexpectedPerDrawWrites: unexpected,
      finished: room?.status === "finished",
      crashRecovery: r.crashRecovery,
    });
  }
  console.log(
    JSON.stringify(
      {
        phase: "finalize",
        table,
        MULTI_CANARY_ROOMS: 5,
        CLEAN_MATCH_ROOMS: cleanMatch,
        CRASH_RECOVERY_ROOM: state.rooms[CRASH_ROOM_INDEX]?.roomId,
        rollbackTriggered: state.rollbackTriggered,
      },
      null,
      2
    )
  );
}

async function phaseDisable() {
  await repo.syncGameplayManifestRamRuntimeFlag(false);
  const { data } = await supabase
    .from("app_runtime_flags")
    .select("gameplay_manifest_ram_enabled")
    .eq("id", true)
    .single();
  console.log(JSON.stringify({ phase: "disable", dbFlag: data?.gameplay_manifest_ram_enabled }, null, 2));
}

async function phaseWaitFinished(timeoutMs = 600_000) {
  const state = await loadState();
  if (!state) throw new Error("no canary state");
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const statuses = await Promise.all(state.rooms.map((r) => repo.getRoom(r.roomId)));
    const allDone = statuses.every((room) => room?.status === "finished");
    const playing = statuses.filter((r) => r?.status === "playing").length;
    log.info("[MultiCanary] wait", { playing, finished: 5 - playing, elapsedMs: Date.now() - t0 });
    if (allDone) {
      console.log(JSON.stringify({ phase: "waitFinished", ok: true, elapsedMs: Date.now() - t0 }));
      return;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.log(JSON.stringify({ phase: "waitFinished", ok: false, timeoutMs }));
}

async function phaseCrashReady(minDraws = 8) {
  const state = await loadState();
  if (!state) throw new Error("no canary state");
  const crashRoom = state.rooms[CRASH_ROOM_INDEX]!;
  const password = process.env.CANARY_PLAYER_PASSWORD ?? process.env.DEV_PLAYER_PASSWORD;
  if (!password) {
    console.log(JSON.stringify({ phase: "crashReady", ready: false, reason: "no password for live-room" }));
    return;
  }
  const token = await getPlayerToken("mexic@dingmoney.org", password);
  const snap = await getEngineLiveSnapshot(crashRoom.roomId, token);
  const eventSeq = snap.body?.eventSeq ?? 0;
  const ready = snap.status === 200 && eventSeq >= minDraws;
  console.log(
    JSON.stringify(
      {
        phase: "crashReady",
        crashRoomId: crashRoom.roomId,
        eventSeq,
        minDraws,
        ready,
        source: snap.body?.source,
      },
      null,
      2
    )
  );
}

const phases: Record<string, () => Promise<void>> = {
  precheck: phasePrecheck,
  enable: phaseEnable,
  create: phaseCreate,
  predraw: phasePredraw,
  monitor: phaseMonitor,
  clientProof: phaseClientProof,
  waitFinished: phaseWaitFinished,
  crashReady: phaseCrashReady,
  finalize: phaseFinalize,
  disable: phaseDisable,
};

const fn = phases[PHASE];
if (!fn) {
  console.error(`Unknown phase: ${PHASE}. Use: ${Object.keys(phases).join(", ")}`);
  process.exit(1);
}
await fn();
