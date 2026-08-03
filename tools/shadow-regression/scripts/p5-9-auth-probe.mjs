import dotenv from "dotenv";
import fs from "fs";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const pulled = fs.readFileSync(".env.vercel.winway-dev.production.tmp", "utf8");
function pulledValue(key) {
  const m = pulled.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) return null;
  return m[1].replace(/^"|"$/g, "");
}
const db = pulledValue("DATABASE_URL");
const flag = pulledValue("PLATFORM_REPORTS_SOURCE");
console.log(
  JSON.stringify(
    {
      flag,
      dbRedacted: db ? db.replace(/:[^:@/]+@/, ":***@") : null,
      doubled: /^DATABASE_URL=/i.test(db || ""),
      host: (db || "").match(/@([^:/]+)/)?.[1] || null,
    },
    null,
    2
  )
);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const email = (
  await pool.query(
    `SELECT email FROM public.users WHERE role IN ('admin','super') AND status='active'
     ORDER BY CASE WHEN role='super' THEN 0 ELSE 1 END LIMIT 1`
  )
).rows[0].email;

for (const type of ["magiclink", "recovery", "invite"]) {
  const genRes = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type, email }),
  });
  const gen = await genRes.json();
  console.log(
    JSON.stringify({
      type,
      status: genRes.status,
      keys: Object.keys(gen || {}),
      propKeys: Object.keys(gen?.properties || {}),
      message: gen?.message || null,
      hint: gen?.hint || null,
      hasHashed: Boolean(gen?.hashed_token || gen?.properties?.hashed_token),
      hasOtp: Boolean(gen?.email_otp || gen?.properties?.email_otp),
    })
  );
  if (gen?.properties?.hashed_token || gen?.hashed_token) {
    const token_hash = gen.hashed_token || gen.properties.hashed_token;
    const otpRes = await fetch(`${url}/auth/v1/verify`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: type === "recovery" ? "recovery" : "email", token_hash }),
    });
    const otp = await otpRes.json();
    console.log(
      JSON.stringify({
        verifyStatus: otpRes.status,
        hasAccess: Boolean(otp.access_token),
        otpMessage: otp?.msg || otp?.message || null,
      })
    );
    if (otp.access_token) {
      const api = await fetch(
        "https://dev.dingmoney.org/api/admin/platform-sessions/report?period=month&page=1&pageSize=20",
        { headers: { Authorization: `Bearer ${otp.access_token}` } }
      );
      const body = await api.json();
      console.log(
        JSON.stringify({
          apiStatus: api.status,
          reportsSource: body?.data?.reportsSource,
          error: body?.error,
          detail: body?.detail,
          totalCount: body?.data?.totalCount,
          itemCount: body?.data?.items?.length,
          sampleStatus: body?.data?.items?.[0]?.status,
        })
      );
      break;
    }
  }
}
await pool.end();
