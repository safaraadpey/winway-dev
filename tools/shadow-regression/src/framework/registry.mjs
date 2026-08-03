/** @type {Map<string, { engine: string, scenarios: import('./types.mjs').Scenario[] }>} */
const engines = new Map();

/**
 * @param {string} name
 * @param {import('./types.mjs').Scenario[]} scenarios
 */
export function registerEngine(name, scenarios) {
  engines.set(name, { engine: name, scenarios });
}

/**
 * @param {string} [name]
 */
export function getScenarios(name) {
  if (name) {
    const pack = engines.get(name);
    if (!pack) throw new Error(`Unknown engine: ${name}`);
    return pack.scenarios;
  }
  return [...engines.values()].flatMap((p) => p.scenarios);
}

export function listEngines() {
  return [...engines.keys()];
}
