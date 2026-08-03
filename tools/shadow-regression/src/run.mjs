#!/usr/bin/env node
import { config } from "./config.mjs";
import { closePool, getPool, query } from "./db.mjs";
import { registerEngine, runHarness } from "./framework/runner.mjs";
import { bingoScenarios } from "./engines/bingo/scenarios.mjs";

registerEngine("bingo", bingoScenarios);

// Placeholder registration point for future engines:
// registerEngine("backgammon", backgammonScenarios);

async function main() {
  console.log("Platform Shadow Regression Harness");
  console.log(`Engine: ${config.engine}`);
  if (config.filter.length) console.log(`Filter: ${config.filter.join(", ")}`);

  if (!config.databaseUrl) {
    console.error("\nFAIL: DATABASE_URL is not set.");
    console.error("Set DATABASE_URL in .env.local (direct Postgres) then re-run:");
    console.error("  npm run test:shadow\n");
    process.exit(2);
  }

  getPool();

  // Smoke: platform shadow functions exist
  await query(`SELECT platform.fn_shadow_map_lifecycle('waiting', NULL)`);

  const { overall } = await runHarness({
    engine: config.engine,
    filter: config.filter,
    keepRooms: config.keepRooms,
    reportsDir: config.reportsDir,
    query,
    pool: getPool(),
    config,
  });

  await closePool();
  process.exit(overall === "PASS" ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await closePool();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
