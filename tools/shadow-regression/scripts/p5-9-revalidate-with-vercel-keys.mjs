import fs from "fs";
import pg from "pg";
import { execSync } from "node:child_process";

const pulled = fs.readFileSync(".env.vercel.winway-dev.production.tmp", "utf8");
function val(key) {
  const m = pulled.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) return null;
  return m[1].replace(/^"|"$/g, "");
}

const url = val("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = val("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = val("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const dbRaw = val("DATABASE_URL");
const flag = val("PLATFORM_REPORTS_SOURCE");
const dbEffective = (dbRaw || "").replace(/^DATABASE_URL=/i, "");
const doubled = /^DATABASE_URL=/i.test(dbRaw || "");
const host = dbEffective.match(/@([^:/]+)/)?.[1] || null;

console.log(
  JSON.stringify({
    flag,
    url,
    host,
    doubled,
    dbRedacted: dbRaw ? dbRaw.replace(/:[^:@/]+@/, ":***@") : null,
    serviceKeyLen: serviceKey?.length,
    keysWorkProbe: null,
  })
);

const rest = await fetch(`${url}/rest/v1/users?select=id,email,role&role=in.(admin,super)&limit=1`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
});
const restText = await rest.text();
console.log("rest", rest.status, restText.slice(0, 180));

if (rest.status !== 200) {
  process.exit(1);
}

const admin = JSON.parse(restText)[0];
const genRes = await fetch(`${url}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ type: "magiclink", email: admin.email }),
});
const gen = await genRes.json();
const token_hash = gen.hashed_token || gen.properties?.hashed_token;
if (!token_hash) {
  console.log("gen_fail", genRes.status, JSON.stringify({ keys: Object.keys(gen), message: gen.message }));
  process.exit(1);
}

const otpRes = await fetch(`${url}/auth/v1/verify`, {
  method: "POST",
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ type: "email", token_hash }),
});
const otp = await otpRes.json();
if (!otp.access_token) {
  console.log("otp_fail", otpRes.status, otp.message || otp.msg);
  process.exit(1);
}

const t0 = Date.now();
const apiRes = await fetch(
  "https://dev.dingmoney.org/api/admin/platform-sessions/report?period=month&page=1&pageSize=50",
  { headers: { Authorization: `Bearer ${otp.access_token}`, Accept: "application/json" } }
);
const latencyMs = Date.now() - t0;
const body = await apiRes.json();

// Parity via local pooler (correct connection string)
const pool = new pg.Pool({
  connectionString: dbEffective.startsWith("postgres")
    ? dbEffective
    : process.env.DATABASE_URL || dbEffective,
  ssl: { rejectUnauthorized: false },
});
// Prefer known-good pooler from effective if doubled was stripped; if connection fails try .env.local
let poolOk = false;
let legacy = null;
let shadow = null;
try {
  await pool.query("select 1");
  poolOk = true;
} catch (e) {
  console.log("pool_from_vercel_value_failed", String(e.message || e).slice(0, 200));
}

async function buildLegacy(p) {
  const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = new Date();
  const countRes = await p.query(
    `SELECT count(*)::int AS count FROM public.rooms WHERE created_at >= $1 AND created_at <= $2`,
    [from.toISOString(), to.toISOString()]
  );
  const rooms = await p.query(
    `SELECT id, status, engine_owner_id, created_at, updated_at, waiting_started_at
     FROM public.rooms WHERE created_at >= $1 AND created_at <= $2
     ORDER BY created_at DESC LIMIT 50`,
    [from.toISOString(), to.toISOString()]
  );
  const ids = rooms.rows.map((r) => r.id);
  const tickets = ids.length
    ? await p.query(
        `SELECT room_id, player_user_id, reservation_status, price::float8 AS price, created_at, cancelled_at, updated_at
         FROM public.tickets WHERE room_id = ANY($1::uuid[])`,
        [ids]
      )
    : { rows: [] };
  const byRoom = new Map();
  for (const t of tickets.rows) {
    const list = byRoom.get(t.room_id) || [];
    list.push(t);
    byRoom.set(t.room_id, list);
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
  function mapP({ activeTickets, hasHeld, hasLive }) {
    if (activeTickets <= 0) return "left";
    if (hasLive) return "active";
    if (hasHeld) return "joined";
    return "joined";
  }
  function tsKey(v) {
    if (!v) return null;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : String(v);
  }
  const items = rooms.rows.map((room) => {
    const status = mapLifecycle(room.status, room.engine_owner_id);
    const ts = byRoom.get(room.id) || [];
    const byUser = new Map();
    for (const t of ts) {
      const uid = String(t.player_user_id);
      const st = String(t.reservation_status || "");
      const terminal = ["cancelled", "released", "expired"].includes(st);
      const cur = byUser.get(uid) || {
        activeTickets: 0,
        hasHeld: false,
        hasLive: false,
        amountTotal: 0,
        sourceUpdatedAt: t.updated_at,
      };
      if (!terminal) {
        cur.activeTickets += 1;
        cur.amountTotal += Number(t.price || 0);
        if (st === "held") cur.hasHeld = true;
        if (["reserved", "confirmed", "consumed"].includes(st)) cur.hasLive = true;
      }
      if (t.updated_at > cur.sourceUpdatedAt) cur.sourceUpdatedAt = t.updated_at;
      byUser.set(uid, cur);
    }
    const participants = [...byUser.entries()]
      .map(([userId, a]) => ({
        userId,
        status: mapP(a),
        ticketCount: a.activeTickets,
        amountTotal: Number(a.amountTotal.toFixed(2)),
      }))
      .sort((a, b) => a.userId.localeCompare(b.userId));
    const amountTotal = participants.reduce((s, p) => s + p.amountTotal, 0);
    const participantCount = participants.filter(
      (p) => p.status === "joined" || p.status === "active"
    ).length;
    const startedAt = ["running", "finished", "settled", "archived"].includes(status)
      ? room.waiting_started_at || room.created_at
      : null;
    const finishedAt = ["finished", "settled", "archived"].includes(status)
      ? room.updated_at
      : null;
    const settledAt = status === "settled" ? room.updated_at : null;
    return {
      sessionId: room.id,
      status,
      createdAt: tsKey(room.created_at),
      startedAt: tsKey(startedAt),
      finishedAt: tsKey(finishedAt),
      settledAt: tsKey(settledAt),
      participantCount,
      amountTotal: Number(amountTotal.toFixed(2)),
      participants,
    };
  });
  return { totalCount: countRes.rows[0].count, items, tsKey };
}

let mismatches = [];
if (poolOk) {
  legacy = await buildLegacy(pool);
  const items = body?.data?.items || [];
  const tsKey = (v) => {
    if (!v) return null;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : String(v);
  };
  if (body?.data?.totalCount !== legacy.totalCount) {
    mismatches.push({
      type: "totalCount",
      api: body?.data?.totalCount,
      legacy: legacy.totalCount,
    });
  }
  const lMap = new Map(legacy.items.map((r) => [r.sessionId, r]));
  for (const it of items) {
    const L = lMap.get(it.sessionId);
    if (!L) {
      mismatches.push({ type: "extra", sessionId: it.sessionId });
      continue;
    }
    if (it.status !== L.status) mismatches.push({ type: "status", sessionId: it.sessionId });
    if (it.participantCount !== L.participantCount)
      mismatches.push({ type: "participantCount", sessionId: it.sessionId });
    if (Math.abs(Number(it.amountTotal) - L.amountTotal) > 0.009)
      mismatches.push({ type: "amount", sessionId: it.sessionId });
    for (const f of ["createdAt", "startedAt", "finishedAt", "settledAt"]) {
      if (tsKey(it[f]) !== L[f])
        mismatches.push({ type: "timestamp", field: f, sessionId: it.sessionId });
    }
    const lp = new Map(L.participants.map((p) => [p.userId, p]));
    for (const p of it.participants || []) {
      const e = lp.get(p.userId);
      if (!e) {
        if (p.status !== "left")
          mismatches.push({ type: "participant_extra", sessionId: it.sessionId });
        continue;
      }
      if (p.status !== e.status || p.ticketCount !== e.ticketCount)
        mismatches.push({ type: "participant", sessionId: it.sessionId, userId: p.userId });
      if (Math.abs(Number(p.amountTotal) - e.amountTotal) > 0.009)
        mismatches.push({ type: "participant_amount", sessionId: it.sessionId });
    }
  }
  for (const id of lMap.keys()) {
    if (!(items || []).some((i) => i.sessionId === id))
      mismatches.push({ type: "missing", sessionId: id });
  }

  const recon = await pool.query(`SELECT platform.fn_shadow_participant_recon_report() AS r`);
  const cov = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM public.rooms) AS rooms,
      (SELECT count(*)::int FROM platform.game_sessions WHERE correlation_key LIKE 'bingo.room:%') AS sessions,
      (SELECT count(*)::int FROM public.rooms r LEFT JOIN platform.game_sessions gs ON gs.id=r.id WHERE gs.id IS NULL) AS missing,
      (SELECT count(*)::int FROM platform.shadow_outbox WHERE processed_at IS NULL AND dead_lettered_at IS NULL) AS pending,
      (SELECT count(*)::int FROM platform.shadow_outbox WHERE dead_lettered_at IS NOT NULL) AS dead
  `);
  const pr = recon.rows[0].r;
  shadow = {
    participantRecon: pr,
    coverage: cov.rows[0],
    healthy:
      pr.missing === 0 &&
      pr.duplicate === 0 &&
      pr.status_mismatch === 0 &&
      pr.amount_mismatch === 0 &&
      pr.timestamp_mismatch === 0 &&
      pr.dlq === 0 &&
      pr.pending_outbox === 0 &&
      cov.rows[0].missing === 0 &&
      cov.rows[0].pending === 0 &&
      cov.rows[0].dead === 0,
  };
}
await pool.end().catch(() => {});

let runtimeErrors = [];
try {
  const logOut = execSync(
    "npx vercel logs https://dev.dingmoney.org --project winway-dev --scope kiam-studios-projects 2>&1",
    { encoding: "utf8", timeout: 60000 }
  );
  runtimeErrors = String(logOut)
    .split(/\r?\n/)
    .filter((l) =>
      /PlatformReports|ENOTFOUND|platform_unavailable|platform-sessions\/report/i.test(l)
    )
    .slice(0, 30);
} catch (e) {
  runtimeErrors = [`log_fetch_failed: ${String(e.message || e).slice(0, 200)}`];
}

const detail = body?.detail || body?.message || null;
const failingLayer = (() => {
  if (
    apiRes.status === 200 &&
    body?.data?.reportsSource === "platform" &&
    mismatches.length === 0 &&
    !doubled
  )
    return null;
  if (doubled) return "DATABASE_URL (value incorrectly includes literal 'DATABASE_URL=' prefix)";
  if (/ENOTFOUND/i.test(String(detail)) || runtimeErrors.some((l) => /ENOTFOUND/i.test(l)))
    return "DNS";
  if (body?.error === "platform_unavailable") {
    if (/invalid connection|SASL|password|no PostgreSQL/i.test(String(detail)))
      return "DATABASE_URL / Connection";
    if (/connect|ECONN|timeout/i.test(String(detail))) return "Connection";
    return "Connection / SQL";
  }
  if (apiRes.status === 200 && body?.data?.reportsSource !== "platform") return "API";
  if (apiRes.status === 200 && mismatches.length) return "Mapping";
  return "API";
})();

const checks = {
  envFlagPlatform: flag === "platform",
  envUsesPoolerHost: host === "aws-1-eu-west-2.pooler.supabase.com",
  envDatabaseUrlWellFormed: !doubled && /^postgres(ql)?:\/\//i.test(dbRaw || ""),
  http200: apiRes.status === 200,
  reportsSourcePlatform: body?.data?.reportsSource === "platform",
  sessionsReturned: Array.isArray(body?.data?.items),
  no503: apiRes.status !== 503,
  noPlatformUnavailable: body?.error !== "platform_unavailable",
  noEnotfound: !/ENOTFOUND/i.test(String(detail || "")),
  noLegacyFallback: body?.data?.reportsSource === "platform",
  parityVsLegacy: mismatches.length === 0,
  noRecentPlatformReportsFailures: !runtimeErrors.some((l) =>
    /PlatformReports.*failed|ENOTFOUND|platform_unavailable/i.test(l)
  ),
  shadowHealthy: shadow?.healthy === true,
};

const report = {
  overall: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  target: "https://dev.dingmoney.org",
  vercelProject: "winway-dev",
  vercelEnv: "Production",
  databaseUrl: {
    host,
    usingPooler: host === "aws-1-eu-west-2.pooler.supabase.com",
    doubledPrefixDefect: doubled,
    wellFormed: checks.envDatabaseUrlWellFormed,
    redacted: dbRaw ? dbRaw.replace(/:[^:@/]+@/, ":***@") : null,
  },
  flag,
  httpStatus: apiRes.status,
  latencyMs,
  reportsSource: body?.data?.reportsSource ?? null,
  totalCount: body?.data?.totalCount ?? null,
  itemCount: body?.data?.items?.length ?? 0,
  apiError: body?.error || null,
  apiDetail: detail,
  mismatchCount: mismatches.length,
  mismatches: mismatches.slice(0, 40),
  sample: body?.data?.items?.[0]
    ? {
        sessionId: body.data.items[0].sessionId,
        status: body.data.items[0].status,
        participantCount: body.data.items[0].participantCount,
        amountTotal: body.data.items[0].amountTotal,
        startedAt: body.data.items[0].startedAt,
        finishedAt: body.data.items[0].finishedAt,
        settledAt: body.data.items[0].settledAt,
      }
    : null,
  checks,
  failingLayer,
  shadow,
  impact: {
    wallet: "unchanged (GET-only validation)",
    tournament: "unchanged (GET-only validation)",
    settlement: "unchanged (GET-only validation)",
  },
  runtimeLogHits: runtimeErrors,
};

fs.writeFileSync(
  "docs/testing/p5-9-production-revalidation-raw.json",
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report, null, 2));
process.exit(report.overall === "PASS" ? 0 : 1);
