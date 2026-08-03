#!/usr/bin/env node
/**
 * Multi-replica canary checklist — runs unit harness tests and prints manual steps.
 * Usage: npm run test:multi-replica
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const engineRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const steps = [
  "Apply sql/migrations/20260720120000_engine_lease_epoch_fencing.sql",
  "Run 2–3 game-engine processes with unique ENGINE_ID, shared REDIS_URL + DB",
  "Set COORDINATION_STRICT=true and ENGINE_REPLICA_COUNT to match processes",
  "Cap ROOM_LOOP_MAX_ACTIVE_ROOMS=1 per instance for forced distribution",
  "Kill owner mid-cycle; verify lease takeover and single live epoch per room",
  "Suspend stale owner; verify insert/finalize return not_owner / fenced (-1)",
];

console.log("[Coordination] multi-replica manual canary steps:");
for (const step of steps) {
  console.log(`  - ${step}`);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "src/integration/multiReplicaHarness.test.ts"],
  { cwd: engineRoot, stdio: "inherit", shell: false }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(
  "[Coordination] harness tests passed — complete manual steps before scaling Railway replicas."
);
