/**
 * Backgammon beta integration harness (repository + feature enforcement).
 * Run: node tools/backgammon-e2e/run.mjs
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

config({ path: ".env.local" });

const script = join(dirname(fileURLToPath(import.meta.url)), "harness.ts");
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", script],
  { stdio: "inherit", shell: false, cwd: join(dirname(fileURLToPath(import.meta.url)), "../..") }
);
process.exit(result.status ?? 1);
