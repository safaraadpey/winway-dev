/**
 * R6 soak metrics — read-only report from PostgreSQL.
 * Usage: railway run npx tsx scripts/r6-soak-report.mts [enableIsoTimestamp]
 */
import { createClient } from "@supabase/supabase-js";
import { nodeWebSocketTransport } from "../src/db/node-websocket-transport.js";

const enableAfter = process.argv[2] ?? "2026-09-05T00:53:29.274Z";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: nodeWebSocketTransport },
  }
);

const { data: flag } = await supabase
  .from("app_runtime_flags")
  .select("gameplay_manifest_ram_enabled")
  .eq("id", true)
  .single();

const { data: rooms } = await supabase
  .from("rooms")
  .select("id, room_code, status, gameplay_persist_mode, created_at, finalization_sha256, prize_paid_at")
  .eq("gameplay_persist_mode", "manifest_ram")
  .gte("created_at", enableAfter)
  .order("created_at", { ascending: true });

const finished = (rooms ?? []).filter((r) => r.status === "finished");
const playing = (rooms ?? []).filter((r) => r.status === "playing");
const stuck = (rooms ?? []).filter((r) =>
  ["playing", "settling"].includes(r.status ?? "")
);

const roomIds = finished.map((r) => r.id);
let audits: Array<{
  room_id: string;
  outcome: string;
  unexpected_per_draw_writes: number | null;
  finalization_checksum_mismatch: boolean | null;
  winner_mismatch: boolean | null;
  prize_mismatch: boolean | null;
  roster_mismatch: boolean | null;
  ding_diff: number | null;
}> = [];

if (roomIds.length > 0) {
  const { data } = await supabase
    .from("game_replay_audits")
    .select(
      "room_id, outcome, unexpected_per_draw_writes, finalization_checksum_mismatch, winner_mismatch, prize_mismatch, roster_mismatch, ding_diff, created_at"
    )
    .in("room_id", roomIds)
    .order("created_at", { ascending: false });
  const latestByRoom = new Map<string, (typeof audits)[0]>();
  for (const row of data ?? []) {
    if (!latestByRoom.has(row.room_id)) latestByRoom.set(row.room_id, row);
  }
  audits = [...latestByRoom.values()];
}

const match = audits.filter((a) => a.outcome === "MATCH").length;
const mismatch = audits.filter((a) => a.outcome === "MISMATCH").length;
const error = audits.filter((a) => a.outcome === "ERROR").length;

const { data: perDrawActive } = await supabase
  .from("rooms")
  .select("id, status, gameplay_persist_mode")
  .eq("gameplay_persist_mode", "per_draw")
  .in("status", ["waiting", "playing", "settling"]);

console.log(
  JSON.stringify(
    {
      enableAfter,
      flagOn: flag?.gameplay_manifest_ram_enabled ?? null,
      postRolloutManifestRam: {
        total: rooms?.length ?? 0,
        finished: finished.length,
        playing: playing.length,
        stuck: stuck.length,
        roomCodes: finished.map((r) => ({ id: r.id, code: r.room_code })),
      },
      audits: { match, mismatch, error, latest: audits },
      violations: {
        unexpectedPerDrawWrites: audits.reduce(
          (s, a) => s + (a.unexpected_per_draw_writes ?? 0),
          0
        ),
        checksumMismatch: audits.filter((a) => a.finalization_checksum_mismatch).length,
        rosterMismatch: audits.filter((a) => a.roster_mismatch).length,
        prizeMismatch: audits.filter((a) => a.prize_mismatch).length,
        dingMismatch: audits.filter((a) => (a.ding_diff ?? 0) > 0).length,
        winnerMismatch: audits.filter((a) => a.winner_mismatch).length,
      },
      perDrawActive: perDrawActive ?? [],
      soakTargetMet: finished.length >= 20 && mismatch === 0 && error === 0,
    },
    null,
    2
  )
);
