/**
 * P5.9 deployed cutover validation — winway-dev Production (dev.dingmoney.org)
 * Read-only. Deletes nothing in DB. Does not change code/SQL.
 */
import dotenv from "dotenv";
import pg from "pg";
import fs from "node:fs";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.vercel.winway-dev.production.tmp", override: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const dbUrl = process.env.DATABASE_URL;
const base = "https://dev.dingmoney.org";

function tsKey(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : String(v);
}

if (!url || !serviceKey || !anonKey || !dbUrl) {
  console.error(JSON.stringify({ ok: false, error: "missing env" }));
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function getAdminToken() {
  const adminRes = await pool.query(`
    SELECT id::text AS id, email
    FROM public.users
    WHERE role IN ('admin','super') AND status = 'active'
    ORDER BY CASE WHEN role = 'super' THEN 0 ELSE 1 END, created_at
    LIMIT 1
  `);
  if (!adminRes.rows[0]) throw new Error("no admin user");
  const email = adminRes.rows[0].email;

  const gen = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const genJson = await gen.json();
  if (!gen.ok) throw new Error(`generate_link failed: ${JSON.stringify(genJson)}`);
  const token_hash = genJson?.hashed_token || genJson?.properties?.hashed_token;
  if (!token_hash) throw new Error(`no hashed_token keys=${Object.keys(genJson || {})}`);

  const otp = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "email", token_hash }),
  });
  const otpJson = await otp.json();
  if (!otp.ok || !otpJson.access_token) {
    throw new Error(`verify failed: ${JSON.stringify(otpJson)}`);
  }
  return { token: otpJson.access_token, email };
}

async function expectedPlatformPage(from, to, pageSize) {
  const countRes = await pool.query(
    `SELECT count(*)::int AS count
     FROM platform.game_sessions gs
     WHERE gs.correlation_key LIKE 'bingo.room:%'
       AND gs.created_at >= $1 AND gs.created_at <= $2`,
    [from.toISOString(), to.toISOString()]
  );
  const plat = await pool.query(
    `SELECT gs.id, gs.status, gs.created_at, gs.started_at, gs.finished_at, gs.settled_at,
            gs.participant_count
     FROM platform.game_sessions gs
     WHERE gs.correlation_key LIKE 'bingo.room:%'
       AND gs.created_at >= $1 AND gs.created_at <= $2
     ORDER BY gs.created_at DESC
     LIMIT $3`,
    [from.toISOString(), to.toISOString(), pageSize]
  );
  const ids = plat.rows.map((r) => r.id);
  const parts = ids.length
    ? await pool.query(
        `SELECT session_id, amount_total::float8 AS amount_total
         FROM platform.session_participants WHERE session_id = ANY($1::uuid[])`,
        [ids]
      )
    : { rows: [] };
  const byS = new Map();
  for (const p of parts.rows) {
    const list = byS.get(p.session_id) || [];
    list.push(p);
    byS.set(p.session_id, list);
  }
  const items = plat.rows.map((s) => {
    const participants = byS.get(s.id) || [];
    const amountTotal = Number(
      participants.reduce((sum, p) => sum + Number(p.amount_total || 0), 0).toFixed(2)
    );
    const cancelled = s.status === "cancelled";
    return {
      sessionId: s.id,
      status: s.status,
      createdAt: tsKey(s.created_at),
      startedAt: cancelled ? null : tsKey(s.started_at),
      finishedAt: cancelled ? null : tsKey(s.finished_at),
      settledAt: cancelled ? null : tsKey(s.settled_at),
      participantCount: Number(s.participant_count || 0),
      amountTotal,
    };
  });
  return { totalCount: countRes.rows[0].count, items };
}

try {
  const { token, email } = await getAdminToken();

  const unauth = await fetch(
    `${base}/api/admin/platform-sessions/report?period=month&page=1&pageSize=50`
  );

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
  const bodyText = await res.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = { parseError: true, bodyText: bodyText.slice(0, 500) };
  }

  const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = new Date();
  const expected = await expectedPlatformPage(from, to, 50);
  const items = body?.data?.items || [];
  const mismatches = [];

  if (body?.data?.totalCount !== expected.totalCount) {
    mismatches.push({
      type: "totalCount",
      api: body?.data?.totalCount,
      expected: expected.totalCount,
    });
  }
  if (items.length !== expected.items.length) {
    mismatches.push({
      type: "itemCount",
      api: items.length,
      expected: expected.items.length,
    });
  }
  const expMap = new Map(expected.items.map((e) => [e.sessionId, e]));
  for (const it of items) {
    const e = expMap.get(it.sessionId);
    if (!e) {
      mismatches.push({ type: "extra", sessionId: it.sessionId });
      continue;
    }
    if (it.status !== e.status) {
      mismatches.push({
        type: "status",
        sessionId: it.sessionId,
        api: it.status,
        expected: e.status,
      });
    }
    if (it.participantCount !== e.participantCount) {
      mismatches.push({
        type: "participantCount",
        sessionId: it.sessionId,
        api: it.participantCount,
        expected: e.participantCount,
      });
    }
    if (Math.abs(Number(it.amountTotal) - e.amountTotal) > 0.009) {
      mismatches.push({
        type: "amount",
        sessionId: it.sessionId,
        api: it.amountTotal,
        expected: e.amountTotal,
      });
    }
    for (const f of ["createdAt", "startedAt", "finishedAt", "settledAt"]) {
      if (tsKey(it[f]) !== e[f]) {
        mismatches.push({
          type: "timestamp",
          field: f,
          sessionId: it.sessionId,
          api: tsKey(it[f]),
          expected: e[f],
        });
      }
    }
  }

  // Vercel runtime logs (PlatformReports)
  let runtimeLogs = { fetched: false, platformReportsLines: [], errorLines: [] };
  try {
    const { execSync } = await import("node:child_process");
    const logOut = execSync(
      "npx vercel logs https://dev.dingmoney.org --project winway-dev --scope kiam-studios-projects --output raw 2>&1",
      { encoding: "utf8", timeout: 45000, cwd: process.cwd() }
    );
    const lines = String(logOut)
      .split(/\r?\n/)
      .filter((l) => /PlatformReports|platform-sessions\/report|platform_unavailable/i.test(l));
    runtimeLogs = {
      fetched: true,
      platformReportsLines: lines.slice(0, 40),
      errorLines: lines.filter((l) => /error|fail|unavailable|legacy/i.test(l)).slice(0, 20),
    };
  } catch (e) {
    runtimeLogs = {
      fetched: false,
      error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
      platformReportsLines: [],
      errorLines: [],
    };
  }

  // Confirm winway (www) does NOT have the flag set as platform cutover target for this work
  let winwayFlagPresent = null;
  try {
    const { execSync } = await import("node:child_process");
    const ls = execSync(
      "npx vercel env ls --project winway --scope kiam-studios-projects production 2>&1",
      { encoding: "utf8", timeout: 60000 }
    );
    winwayFlagPresent = /PLATFORM_REPORTS_SOURCE/.test(ls);
  } catch {
    winwayFlagPresent = null;
  }

  const cancelled = items.find((i) => i.status === "cancelled");

  const report = {
    targetHost: base,
    vercelProject: "winway-dev",
    vercelEnv: "Production",
    flagFromVercelPull: process.env.PLATFORM_REPORTS_SOURCE,
    winwayProdHasPlatformReportsSource: winwayFlagPresent,
    adminEmailDomain: String(email).split("@")[1] || null,
    unauthStatus: unauth.status,
    httpStatus: res.status,
    latencyMs,
    ok: body?.ok === true,
    reportsSource: body?.data?.reportsSource ?? null,
    totalCount: body?.data?.totalCount ?? null,
    itemCount: items.length,
    hasCompareBlock: Boolean(body?.data?.compare),
    apiError: body?.error || null,
    apiMessage: body?.message || null,
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 30),
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
          p59NullOk:
            cancelled.startedAt == null &&
            cancelled.finishedAt == null &&
            cancelled.settledAt == null,
        }
      : null,
    runtimeLogs,
    impact: {
      note: "Validation used GET only on platform-sessions report + auth; no wallet/tournament/settlement writes issued",
      walletWrites: 0,
      tournamentWrites: 0,
      lobbyWrites: 0,
      liveGameWrites: 0,
      settlementWrites: 0,
    },
  };

  report.checks = {
    envFlagPlatform: report.flagFromVercelPull === "platform",
    http200: report.httpStatus === 200,
    responseSourcePlatform: report.reportsSource === "platform",
    noLegacyFallback: report.reportsSource === "platform" && !report.hasCompareBlock,
    dataParity: report.mismatchCount === 0,
    noApiError: !report.apiError,
    cancelledTsNull: report.cancelledProjection ? report.cancelledProjection.p59NullOk : true,
  };

  report.pass = Object.values(report.checks).every(Boolean);

  fs.writeFileSync(
    "docs/testing/p5-9-deployed-cutover-validation-raw.json",
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exit(1);
} finally {
  await pool.end();
}
