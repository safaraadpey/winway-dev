/**
 * R6 post-rollout verified-path room batch (fn_system_join_or_create_room).
 * Usage: railway run npx tsx scripts/r6-post-rollout-batch.mts create|wait|audit
 */
import { createClient } from "@supabase/supabase-js";
import { auditGameRoom } from "../src/domain/replay/processGameReplayJob.js";
import { nodeWebSocketTransport } from "../src/db/node-websocket-transport.js";
import { GameRepo } from "../src/repositories/index.js";

const PHASE = process.argv[2] ?? "create";
const ENABLE_AFTER = "2026-09-05T00:53:29.274Z";
const STATE_FILE = ".r6-post-rollout-rooms.json";

const PLAYERS = {
  mexic: "cb1eda6a-c471-4adb-a2b0-b1f44fd97e99",
  matin: "73d34393-9f1b-4b94-8e49-9dba33345cfd",
  dev1: "1b6d5f20-b340-4058-8707-1b5987f201a1",
};

const BATCH_TEMPLATES = [
  "8bf819ab-798d-4ada-854c-f46fbb94af51",
  "5b2d8bf2-7d46-427a-99da-31479a6d5acc",
  "e954ae1a-4e58-47a9-aace-6b14d4b21f72",
  "7c19ab98-60e6-4c50-8180-ae10539592f7",
  "06283520-1902-4aa3-af04-4f7d93d1dfd9",
  "8b350f45-404f-4b90-b429-7a4591a72403",
  "2fa31179-740b-40aa-b09f-371a23821b3f",
  "5d14d5b2-7391-48d6-84fb-7b5bf798f1d8",
  "78b4d33f-40c4-4b7c-bc25-76e01c1ebf90",
  "79e1d317-3d62-408f-955e-320de3495408",
  "698e0ff4-ac87-4cd9-95ac-2bdc45123239",
  "e79642db-d230-477c-94bf-7fd47b974a97",
  "edc790b4-6195-43ad-9ddb-abcba407f0eb",
  "84721645-4e85-406d-b937-9ec1b990521e",
  "43a0fb7c-99b8-4c64-974c-bb52286c0907",
  "14aeb421-8045-422d-8ae5-1792e1457b9f",
  "cc158db4-c105-4643-b0e5-d6b1c33a878d",
  "f90ecd81-f01b-40ba-a550-bbc0b31315b2",
  "e2016846-8329-4074-a9cf-223a1845507b",
  "cb567a31-3d9b-48c4-84dc-f563c89b0f20",
];

const log = {
  info: (msg: string, fields?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level: "info", msg, ...fields })),
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

interface StoredRoom {
  roomId: string;
  templateId: string;
  code?: string;
}

async function loadRooms(): Promise<StoredRoom[]> {
  try {
    const fs = await import("node:fs/promises");
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as StoredRoom[];
  } catch {
    return [];
  }
}

async function saveRooms(rooms: StoredRoom[]): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.writeFile(STATE_FILE, JSON.stringify(rooms, null, 2));
}

async function joinRoom(userId: string, templateId: string): Promise<string> {
  const { data, error } = await supabase.rpc("fn_system_join_or_create_room", {
    p_user_id: userId,
    p_template_id: templateId,
    p_card_count: 1,
    p_password: null,
  });
  if (error) throw new Error(`join failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return (row?.room_id ?? row?.roomId) as string;
}

async function phaseCreate() {
  const existing = await loadRooms();
  const startIdx = existing.length;
  if (startIdx >= BATCH_TEMPLATES.length) {
    console.log(JSON.stringify({ phase: "create", skipped: "batch exhausted" }));
    return;
  }
  const players = [PLAYERS.mexic, PLAYERS.matin, PLAYERS.dev1];
  const created: StoredRoom[] = [...existing];
  for (let i = startIdx; i < Math.min(startIdx + 5, BATCH_TEMPLATES.length); i++) {
    const templateId = BATCH_TEMPLATES[i]!;
    const p1 = players[i % 3]!;
    const p2 = players[(i + 1) % 3]!;
    const r1 = await joinRoom(p1, templateId);
    await new Promise((r) => setTimeout(r, 250));
    const r2 = await joinRoom(p2, templateId);
    if (r1 !== r2) throw new Error(`room mismatch ${r1} vs ${r2}`);
    const room = await repo.getRoom(r1);
    if (room?.gameplay_persist_mode !== "manifest_ram") {
      throw new Error(`room ${r1} not manifest_ram: ${room?.gameplay_persist_mode}`);
    }
    created.push({
      roomId: r1,
      templateId,
      code: (room as { room_code?: string }).room_code,
    });
    log.info("[R6] post-rollout room", { roomId: r1, code: (room as { room_code?: string }).room_code, templateId });
  }
  await saveRooms(created);
  console.log(JSON.stringify({ phase: "create", created: created.slice(startIdx), total: created.length }, null, 2));
}

async function phaseWait() {
  const rooms = await loadRooms();
  const t0 = Date.now();
  while (Date.now() - t0 < 600_000) {
    const statuses = await Promise.all(rooms.map((r) => repo.getRoom(r.roomId)));
    const finished = statuses.filter((s) => s?.status === "finished").length;
    const playing = statuses.filter((s) => s?.status === "playing").length;
    log.info("[R6] wait", { finished, playing, total: rooms.length });
    if (finished === rooms.length) {
      console.log(JSON.stringify({ phase: "wait", ok: true, elapsedMs: Date.now() - t0 }));
      return;
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  console.log(JSON.stringify({ phase: "wait", ok: false }));
}

async function phaseAudit() {
  const rooms = await loadRooms();
  const results = [];
  for (const r of rooms) {
    const room = await repo.getRoom(r.roomId);
    const outcome = await auditGameRoom(repo, log, r.roomId);
    const unexpected = room?.prize_paid_at
      ? await repo.countUnexpectedPreFinalizationWrites(r.roomId, room.prize_paid_at)
      : 0;
    results.push({
      roomId: r.roomId,
      code: r.code ?? (room as { room_code?: string })?.room_code,
      mode: room?.gameplay_persist_mode,
      status: room?.status,
      audit: outcome,
      unexpectedPerDrawWrites: unexpected,
    });
  }
  console.log(JSON.stringify({ phase: "audit", results }, null, 2));
}

const phases: Record<string, () => Promise<void>> = {
  create: phaseCreate,
  wait: phaseWait,
  audit: phaseAudit,
};
await (phases[PHASE] ?? phaseCreate)();
