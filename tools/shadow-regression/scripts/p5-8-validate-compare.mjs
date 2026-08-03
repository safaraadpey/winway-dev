import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(JSON.stringify({ error: "NO_DATABASE_URL" }));
  process.exit(2);
}

function mapLifecycle(status, leaseOwner) {
  const s = String(status || "");
  if (s === "cancelled") return "cancelled";
  if (s === "idle") return "archived";
  if (s === "finished") return "settled";
  if (s === "settling") return "finished";
  if (s === "playing" || s === "live") return "running";
  if (s === "waiting" && leaseOwner && String(leaseOwner).trim()) return "claimed";
  if (s === "waiting") return "waiting";
  return "created";
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
const to = new Date().toISOString();

const rooms = await pool.query(
  `SELECT id, status::text, engine_owner_id, created_at
   FROM public.rooms
   WHERE created_at >= $1 AND created_at <= $2
   ORDER BY created_at DESC
   LIMIT 50`,
  [from, to]
);
const ids = rooms.rows.map((r) => r.id);
const sess = await pool.query(
  `SELECT id, status FROM platform.game_sessions WHERE id = ANY($1::uuid[])`,
  [ids]
);
const sm = new Map(sess.rows.map((r) => [r.id, r.status]));
let statusMismatch = 0;
let missing = 0;
for (const r of rooms.rows) {
  const exp = mapLifecycle(r.status, r.engine_owner_id);
  const got = sm.get(r.id);
  if (!got) {
    missing += 1;
    continue;
  }
  if (got !== exp) statusMismatch += 1;
}

const recon = await pool.query(
  `SELECT platform.fn_shadow_participant_recon_report() AS r`
);

console.log(
  JSON.stringify(
    {
      sampleRooms: rooms.rows.length,
      missingSessions: missing,
      statusMismatch,
      participantRecon: recon.rows[0].r,
      flagDefault: process.env.PLATFORM_REPORTS_SOURCE || "legacy",
      endpoint: "/api/admin/platform-sessions/report",
      modes: ["legacy", "platform", "compare"],
    },
    null,
    2
  )
);

await pool.end();
