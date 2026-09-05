/**
 * Re-run shadow replay audit for specific room IDs (read-only on gameplay).
 * Usage: railway run npx tsx scripts/rerun-game-replay-audit.mts <roomId> [roomId...]
 */
import { createClient } from "@supabase/supabase-js";
import { auditGameRoom } from "../src/domain/replay/processGameReplayJob.js";
import { nodeWebSocketTransport } from "../src/db/node-websocket-transport.js";
import { GameRepo } from "../src/repositories/index.js";

const log = {
  info: (msg: string, fields?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level: "info", msg, ...fields })),
  warn: (msg: string, fields?: Record<string, unknown>) =>
    console.warn(JSON.stringify({ level: "warn", msg, ...fields })),
  error: (msg: string, fields?: Record<string, unknown>) =>
    console.error(JSON.stringify({ level: "error", msg, ...fields })),
};

const roomIds = process.argv.slice(2);
if (roomIds.length === 0) {
  console.error("Usage: rerun-game-replay-audit.mts <roomId> [roomId...]");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: nodeWebSocketTransport },
  }
);
const repo = new GameRepo(supabase);

for (const roomId of roomIds) {
  const outcome = await auditGameRoom(repo, log, roomId);
  console.log(JSON.stringify({ roomId, outcome }, null, 2));
}
