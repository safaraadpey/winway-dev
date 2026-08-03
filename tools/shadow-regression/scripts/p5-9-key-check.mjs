import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log(
  JSON.stringify({
    url,
    serviceKeyLen: serviceKey?.length,
    anonKeyLen: anonKey?.length,
    servicePrefix: serviceKey?.slice(0, 20),
    anonPrefix: anonKey?.slice(0, 20),
  })
);

const r1 = await fetch(`${url}/auth/v1/health`);
console.log("health", r1.status, await r1.text());

const r2 = await fetch(`${url}/rest/v1/users?select=id,role&role=in.(admin,super)&limit=1`, {
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  },
});
console.log("rest users", r2.status, (await r2.text()).slice(0, 200));

const r3 = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  },
});
console.log("admin users", r3.status, (await r3.text()).slice(0, 300));

// Unauth + bogus token probes against deployed API
const u = await fetch(
  "https://dev.dingmoney.org/api/admin/platform-sessions/report?period=day"
);
console.log("api unauth", u.status, (await u.text()).slice(0, 200));

// Check deployment env via vercel inspect if possible
const pulled = fs.readFileSync(".env.vercel.winway-dev.production.tmp", "utf8");
const dbLine = pulled.split(/\n/).find((l) => l.startsWith("DATABASE_URL="));
console.log("dbLineRedacted", dbLine?.replace(/:[^:@/]+@/, ":***@"));
