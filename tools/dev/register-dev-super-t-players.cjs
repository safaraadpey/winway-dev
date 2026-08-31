/**
 * Register all t* players under a super/agent into an open tournament.
 *
 * Uses tournament.fn_dev_register_downline_prefix → public.fn_tournament_wallet_hold
 * (same hold path as the player tournament UI). Idempotent: skips created/settled.
 *
 * Usage:
 *   node tools/dev/register-dev-super-t-players.cjs
 *   node tools/dev/register-dev-super-t-players.cjs --title "تست 14"
 *   node tools/dev/register-dev-super-t-players.cjs --title "تست 15"
 *   node tools/dev/register-dev-super-t-players.cjs --parent dev_super --prefix t --title "تست 14"
 *   npm run dev:register-t-players -- --title "تست 14"
 *
 * Requires DATABASE_URL in .env.local
 */
require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

async function main() {
  const parent = arg("parent", "dev_super");
  const prefix = arg("prefix", "t");
  const title = arg("title", "تست 14");
  const tournamentId = arg("tournament-id", null);
  const qty = Number(arg("qty", "1")) || 1;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[DevRegister] Missing DATABASE_URL in .env.local");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log(
      `[DevRegister] parent=${parent} prefix=${prefix}* title=${title} qty=${qty}`
    );

    const { rows } = await client.query(
      `SELECT username, user_id, entry_id, action, detail
         FROM tournament.fn_dev_register_downline_prefix($1, $2, $3, $4::uuid, $5)`,
      [parent, prefix, title, tournamentId, qty]
    );

    let registered = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const tag = row.action.toUpperCase();
      const extra = row.detail ? ` ${row.detail}` : "";
      console.log(`[DevRegister] ${tag} ${row.username}${extra}`);
      if (row.action === "registered") registered += 1;
      else if (row.action === "skipped") skipped += 1;
      else failed += 1;
    }

    console.log(
      `[DevRegister] Done: ${registered} registered, ${skipped} skipped, ${failed} failed (${rows.length} total)`
    );
    if (failed > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("[DevRegister] fatal", e.message || e);
  process.exit(1);
});
