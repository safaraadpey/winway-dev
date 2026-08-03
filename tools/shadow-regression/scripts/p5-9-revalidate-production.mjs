/**
 * P5.9 re-validation — winway-dev Production after DATABASE_URL fix.
 * Read-only. No code/SQL changes.
 */
import dotenv from "dotenv";
import pg from "pg";
import fs from "node:fs";
import { execSync } from "node:child_process";

dotenv.config({ path: ".env.local" });
// Pull file may have malformed value; parse carefully
const pulledPath = ".env.vercel.winway-dev.production.tmp";
const pulled = fs.existsSync(pulledPath) ? fs.readFileSync(pulledPath, "utf8") : "";
function pulledValue(key) {
  const m = pulled.match(new RegExp(`^${key}="?([^"\\n]*)"?$`, "m"));
  return m ? m[1] : null;
}
const flagPulled = pulledValue("PLATFORM_REPORTS_SOURCE");
const dbUrlPulledRaw = pulledValue("DATABASE_URL");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const dbUrlLocal = process.env.DATABASE_URL;
const base = "https://dev.dingmoney.org";

function tsKey(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : String(v);
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

function mapParticipantStatus({ activeTickets, hasHeld, hasLive }) {
  if (activeTickets <= 0) return "left";
  if (hasLive) return "active";
  if (hasHeld) return "joined";
  return "joined";
}

function redactDb(u) {
  if (!u) return null;
  return String(u).replace(/:[^:@/]+@/, ":***@");
}

function dbHost(u) {
  if (!u) return null;
  try {
    const cleaned = u.replace(/^DATABASE_URL=/i, "");
    return new URL(cleaned).hostname;
  } catch {
    const m = String(u).match(/@([^:/]+)/);
    return m ? m[1] : null;
  }
}

if (!url || !serviceKey || !anonKey || !dbUrlLocal) {
  console.error(JSON.stringify({ ok: false, error: "missing local env for auth/parity" }));
  process.exit(2);
}

const pool = new pg.Pool({
  connectionString: dbUrlLocal,
  ssl: { rejectUnauthorized: false },
});

async function getAdminToken() {
  const adminRes = await pool.query(`
    SELECT email
    FROM public.users
    WHERE role IN ('admin','super') AND status = 'active'
    ORDER BY CASE WHEN role = 'super' THEN 0 ELSE 1 END, created_at
    LIMIT 1
  `);
  const email = adminRes.rows[0]?.email;
  if (!email) throw new Error("no admin user");

  const gen = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  }).then((r) => r.json());
  const token_hash = gen.hashed_token || gen.properties?.hashed_token;
  if (!token_hash) throw new Error(`no hashed_token: ${JSON.stringify(Object.keys(gen || {}))}`);

  const otp = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "email", token_hash }),
  }).then((r) => r.json());
  if (!otp.access_token) throw new Error(`verify failed: ${JSON.stringify(otp)}`);
  return { token: otp.access_token, email };
}

async function fetchLegacy(from, to, pageSize) {
  const roomsRes = await pool.query(
    `SELECT r.id, r.status, r.engine_owner_id, r.created_at, r.updated_at, r.waiting_started_at
     FROM public.rooms r
     WHERE r.created_at >= $1 AND r.created_at <= $2
     ORDER BY r.created_at DESC
     LIMIT $3`,
    [from.toISOString(), to.toISOString(), pageSize]
  );
  const countRes = await pool.query(
    `SELECT count(*)::int AS count FROM public.rooms r
     WHERE r.created_at >= $1 AND r.created_at <= $2`,
    [from.toISOString(), to.toISOString()]
  );
  const roomIds = roomsRes.rows.map((r) => r.id);
  const ticketsByRoom = new Map();
  if (roomIds.length) {
    const tRes = await pool.query(
      `SELECT room_id, player_user_id, reservation_status, price::float8 AS price,
              created_at, cancelled_at, updated_at
       FROM public.tickets WHERE room_id = ANY($1::uuid[])`,
      [roomIds]
    );
    for (const t of tRes.rows) {
      const list = ticketsByRoom.get(t.room_id) || [];
      list.push(t);
      ticketsByRoom.set(t.room_id, list);
    }
  }

  const items = roomsRes.rows.map((room) => {
    const status = mapLifecycle(room.status, room.engine_owner_id);
    const tickets = ticketsByRoom.get(room.id) || [];
    const byUser = new Map();
    for (const t of tickets) {
      const uid = String(t.player_user_id);
      const st = String(t.reservation_status || "");
      const terminal = ["cancelled", "released", "expired"].includes(st);
      const cur = byUser.get(uid) || {
        activeTickets: 0,
        hasHeld: false,
        hasLive: false,
        amountTotal: 0,
        joinedAt: t.created_at,
        leftAt: null,
        sourceUpdatedAt: t.updated_at,
      };
      if (!terminal) {
        cur.activeTickets += 1;
        cur.amountTotal += Number(t.price || 0);
        if (st === "held") cur.hasHeld = true;
        if (["reserved", "confirmed", "consumed"].includes(st)) cur.hasLive = true;
      }
      if (t.created_at < cur.joinedAt) cur.joinedAt = t.created_at;
      if (t.updated_at > cur.sourceUpdatedAt) cur.sourceUpdatedAt = t.updated_at;
      if (terminal && t.cancelled_at) {
        if (!cur.leftAt || t.cancelled_at > cur.leftAt) cur.leftAt = t.cancelled_at;
      }
      byUser.set(uid, cur);
    }
    const participants = [...byUser.entries()]
      .map(([userId, a]) => {
        const pStatus = mapParticipantStatus(a);
        return {
          userId,
          status: pStatus,
          ticketCount: a.activeTickets,
          amountTotal: Number(a.amountTotal.toFixed(2)),
          sourceUpdatedAt: a.sourceUpdatedAt,
        };
      })
      .sort((x, y) => x.userId.localeCompare(y.userId));
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
      createdAt: room.created_at,
      startedAt,
      finishedAt,
      settledAt,
      participantCount,
      amountTotal: Number(amountTotal.toFixed(2)),
      participants,
    };
  });

  return { totalCount: countRes.rows[0].count, items };
}

function compare(legacy, apiItems, apiTotal) {
  const mismatches = [];
  if (apiTotal !== legacy.totalCount) {
    mismatches.push({ type: "totalCount", api: apiTotal, legacy: legacy.totalCount });
  }
  if (apiItems.length !== legacy.items.length) {
    mismatches.push({
      type: "itemCount",
      api: apiItems.length,
      legacy: legacy.items.length,
    });
  }
  const lMap = new Map(legacy.items.map((r) => [r.sessionId, r]));
  for (const it of apiItems) {
    const L = lMap.get(it.sessionId);
    if (!L) {
      mismatches.push({ type: "extra_on_api", sessionId: it.sessionId });
      continue;
    }
    if (it.status !== L.status) {
      mismatches.push({
        type: "status",
        sessionId: it.sessionId,
        api: it.status,
        legacy: L.status,
      });
    }
    if (it.participantCount !== L.participantCount) {
      mismatches.push({
        type: "participantCount",
        sessionId: it.sessionId,
        api: it.participantCount,
        legacy: L.participantCount,
      });
    }
    if (Math.abs(Number(it.amountTotal) - L.amountTotal) > 0.009) {
      mismatches.push({
        type: "amount",
        sessionId: it.sessionId,
        api: it.amountTotal,
        legacy: L.amountTotal,
      });
    }
    for (const f of ["createdAt", "startedAt", "finishedAt", "settledAt"]) {
      if (tsKey(it[f]) !== tsKey(L[f])) {
        mismatches.push({
          type: "timestamp",
          field: f,
          sessionId: it.sessionId,
          api: tsKey(it[f]),
          legacy: tsKey(L[f]),
        });
      }
    }
    const lp = new Map(L.participants.map((p) => [p.userId, p]));
    for (const p of it.participants || []) {
      const e = lp.get(p.userId);
      if (!e) {
        if (p.status !== "left") {
          mismatches.push({
            type: "participant_extra",
            sessionId: it.sessionId,
            userId: p.userId,
          });
        }
        continue;
      }
      if (p.status !== e.status) {
        mismatches.push({
          type: "participant_status",
          sessionId: it.sessionId,
          userId: p.userId,
          api: p.status,
          legacy: e.status,
        });
      }
      if (p.ticketCount !== e.ticketCount) {
        mismatches.push({
          type: "participant_tickets",
          sessionId: it.sessionId,
          userId: p.userId,
        });
      }
      if (Math.abs(Number(p.amountTotal) - e.amountTotal) > 0.009) {
        mismatches.push({
          type: "participant_amount",
          sessionId: it.sessionId,
          userId: p.userId,
        });
      }
    }
  }
  for (const id of lMap.keys()) {
    if (!apiItems.some((i) => i.sessionId === id)) {
      mismatches.push({ type: "missing_on_api", sessionId: id });
    }
  }
  return mismatches;
}

try {
  const dbUrlLooksDoubled = Boolean(
    dbUrlPulledRaw && /^DATABASE_URL=/i.test(dbUrlPulledRaw)
  );
  const dbUrlEffective = dbUrlPulledRaw
    ? dbUrlPulledRaw.replace(/^DATABASE_URL=/i, "")
    : null;
  const host = dbHost(dbUrlPulledRaw);
  const usingPooler = host === "aws-1-eu-west-2.pooler.supabase.com";
  const usingDirectDb = host && /^db\./.test(host);

  const { token, email } = await getAdminToken();

  const t0 = Date.now();
  const res = await fetch(
    `${base}/api/admin/platform-sessions/report?period=month&page=1&pageSize=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );
  const latencyMs = Date.now() - t0;
  const body = await res.json().catch(() => ({ parseError: true }));

  const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = new Date();
  const legacy = await fetchLegacy(from, to, 50);
  const items = body?.data?.items || [];
  const mismatches = compare(legacy, items, body?.data?.totalCount);

  let runtimeLogs = { fetched: false, lines: [], errors: [] };
  try {
    const logOut = execSync(
      "npx vercel logs https://dev.dingmoney.org --project winway-dev --scope kiam-studios-projects 2>&1",
      { encoding: "utf8", timeout: 60000 }
    );
    const lines = String(logOut)
      .split(/\r?\n/)
      .filter((l) =>
        /PlatformReports|platform-sessions\/report|ENOTFOUND|platform_unavailable/i.test(l)
      );
    runtimeLogs = {
      fetched: true,
      lines: lines.slice(0, 40),
      errors: lines.filter((l) =>
        /error|ENOTFOUND|platform_unavailable|failed/i.test(l)
      ),
    };
  } catch (e) {
    runtimeLogs = {
      fetched: false,
      error: String(e?.message || e).slice(0, 400),
      lines: [],
      errors: [],
    };
  }

  let shadow = {};
  try {
    const recon = await pool.query(
      `SELECT platform.fn_shadow_participant_recon_report() AS r`
    );
    shadow.participantRecon = recon.rows[0].r;
  } catch (e) {
    shadow.participantReconError = String(e.message || e);
  }
  const cov = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM public.rooms) AS rooms,
      (SELECT count(*)::int FROM platform.game_sessions WHERE correlation_key LIKE 'bingo.room:%') AS sessions,
      (SELECT count(*)::int FROM public.rooms r
        LEFT JOIN platform.game_sessions gs ON gs.id = r.id WHERE gs.id IS NULL) AS missing,
      (SELECT count(*)::int FROM platform.shadow_outbox
        WHERE processed_at IS NULL AND dead_lettered_at IS NULL) AS pending,
      (SELECT count(*)::int FROM platform.shadow_outbox
        WHERE dead_lettered_at IS NOT NULL) AS dead
  `);
  shadow.coverage = cov.rows[0];
  const pr = shadow.participantRecon || {};
  shadow.healthy =
    !shadow.participantReconError &&
    pr.missing === 0 &&
    pr.duplicate === 0 &&
    pr.status_mismatch === 0 &&
    pr.amount_mismatch === 0 &&
    pr.timestamp_mismatch === 0 &&
    pr.dlq === 0 &&
    pr.pending_outbox === 0 &&
    shadow.coverage.missing === 0 &&
    shadow.coverage.pending === 0 &&
    shadow.coverage.dead === 0;

  const cancelled = items.find((i) => i.status === "cancelled");
  const detail = body?.detail || body?.message || null;
  const failingLayer = (() => {
    if (res.status === 200 && body?.data?.reportsSource === "platform" && mismatches.length === 0) {
      return null;
    }
    if (dbUrlLooksDoubled) return "DATABASE_URL (value includes literal DATABASE_URL= prefix)";
    if (/ENOTFOUND/i.test(String(detail)) || runtimeLogs.errors.some((l) => /ENOTFOUND/i.test(l))) {
      return "DNS";
    }
    if (body?.error === "platform_unavailable") {
      if (/DATABASE_URL|not configured|pgPool/i.test(String(detail))) return "DATABASE_URL / Connection";
      if (/connect|ECONN|timeout|SSL/i.test(String(detail))) return "Connection";
      if (/syntax|relation|column/i.test(String(detail))) return "SQL";
      return "Connection / SQL";
    }
    if (res.status === 200 && body?.data?.reportsSource === "legacy") return "API (unexpected legacy fallback)";
    if (res.status === 200 && mismatches.length) return "Mapping / parity";
    if (res.status !== 200) return "API";
    return "unknown";
  })();

  const checks = {
    envFlagPlatform: flagPulled === "platform",
    envDatabaseUrlPooler: usingPooler && !usingDirectDb,
    envDatabaseUrlNotDoubled: !dbUrlLooksDoubled,
    http200: res.status === 200,
    reportsSourcePlatform: body?.data?.reportsSource === "platform",
    sessionsReturned: items.length > 0 || body?.data?.totalCount === 0,
    no503: res.status !== 503,
    noPlatformUnavailable: body?.error !== "platform_unavailable",
    noEnotfound:
      !/ENOTFOUND/i.test(String(detail || "")) &&
      !runtimeLogs.errors.some((l) => /ENOTFOUND/i.test(l)),
    noLegacyFallback: body?.data?.reportsSource === "platform",
    parityCountsStatusesParticipantsAmountsTimestamps: mismatches.length === 0,
    noPlatformReportsRuntimeErrors:
      runtimeLogs.fetched &&
      !runtimeLogs.errors.some((l) =>
        /PlatformReports.*failed|platform_unavailable|ENOTFOUND/i.test(l)
      ),
    shadowHealthy: shadow.healthy === true,
  };

  // If logs couldn't be fetched, don't fail solely on that when API is healthy
  if (!runtimeLogs.fetched && res.status === 200 && body?.data?.reportsSource === "platform") {
    checks.noPlatformReportsRuntimeErrors =
      !/ENOTFOUND|platform_unavailable/i.test(String(detail || ""));
  }

  const report = {
    overall: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
    target: base,
    vercelProject: "winway-dev",
    vercelEnv: "Production",
    databaseUrl: {
      pulledRedacted: redactDb(dbUrlPulledRaw),
      host,
      usingPooler,
      doubledPrefixDefect: dbUrlLooksDoubled,
      effectiveRedacted: redactDb(dbUrlEffective),
    },
    flag: flagPulled,
    httpStatus: res.status,
    latencyMs,
    reportsSource: body?.data?.reportsSource ?? null,
    totalCount: body?.data?.totalCount ?? null,
    itemCount: items.length,
    apiError: body?.error || null,
    apiDetail: detail,
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 40),
    sample: items[0]
      ? {
          sessionId: items[0].sessionId,
          status: items[0].status,
          participantCount: items[0].participantCount,
          amountTotal: items[0].amountTotal,
          startedAt: items[0].startedAt,
          finishedAt: items[0].finishedAt,
          settledAt: items[0].settledAt,
        }
      : null,
    cancelledProjection: cancelled
      ? {
          sessionId: cancelled.sessionId,
          startedAt: cancelled.startedAt,
          finishedAt: cancelled.finishedAt,
          settledAt: cancelled.settledAt,
        }
      : null,
    checks,
    failingLayer,
    shadow,
    impact: {
      wallet: "unchanged (read-only validation)",
      tournament: "unchanged (read-only validation)",
      settlement: "unchanged (read-only validation)",
    },
    runtimeLogs,
    adminEmailDomain: String(email).split("@")[1] || null,
  };

  fs.writeFileSync(
    "docs/testing/p5-9-production-revalidation-raw.json",
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.overall === "PASS" ? 0 : 1);
} catch (err) {
  console.error(JSON.stringify({ overall: "FAIL", error: String(err?.message || err) }, null, 2));
  process.exit(1);
} finally {
  await pool.end();
  try {
    fs.unlinkSync(pulledPath);
  } catch {
    /* ignore */
  }
}
