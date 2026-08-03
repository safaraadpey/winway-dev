import { getScenarios, listEngines, registerEngine } from "./registry.mjs";
import { writeReports } from "../report/generate.mjs";
import { cancelHarnessRoom } from "../engines/bingo/scenarios.mjs";

/**
 * @param {object} opts
 * @param {string} opts.engine
 * @param {string[]} opts.filter
 * @param {boolean} opts.keepRooms
 * @param {string} opts.reportsDir
 * @param {(text: string, params?: unknown[]) => Promise<any>} opts.query
 * @param {import('pg').Pool} opts.pool
 * @param {import('../config.mjs').config} opts.config
 */
export async function runHarness(opts) {
  const startedAt = new Date().toISOString();
  let scenarios = getScenarios(opts.engine);
  if (opts.filter.length) {
    const set = new Set(opts.filter);
    scenarios = scenarios.filter((s) => set.has(s.id));
  }
  if (!scenarios.length) {
    throw new Error(
      `No scenarios for engine=${opts.engine}. Engines: ${listEngines().join(", ")}`
    );
  }

  /** @type {string[]} */
  const createdRoomIds = [];
  /** @type {import('./types.mjs').ScenarioResult[]} */
  const results = [];

  const ctx = {
    pool: opts.pool,
    query: opts.query,
    config: opts.config,
    createdRoomIds,
  };

  for (const sc of scenarios) {
    process.stdout.write(`→ ${sc.id} … `);
    const result = await sc.run(ctx);
    results.push(/** @type {import('./types.mjs').ScenarioResult} */ (result));
    console.log(result.status + (result.mismatch ? ` (${result.mismatch})` : ""));
  }

  if (!opts.keepRooms) {
    for (const id of createdRoomIds) {
      try {
        await cancelHarnessRoom(id);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const { overall, mdPath, jsonPath } = await writeReports(
    results,
    { engine: opts.engine, startedAt, finishedAt },
    opts.reportsDir
  );

  console.log(`\nOverall: ${overall}`);
  console.log(`Report: ${mdPath}`);
  console.log(`JSON:   ${jsonPath}`);

  return { overall, results };
}

export { registerEngine, getScenarios, listEngines };
