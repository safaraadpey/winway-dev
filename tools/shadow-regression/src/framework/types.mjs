/**
 * @typedef {Object} ValidationIssue
 * @property {'hard'|'soft'} severity
 * @property {string} code
 * @property {string} message
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} ok
 * @property {ValidationIssue[]} issues
 * @property {Record<string, unknown>} [meta]
 */

/**
 * @typedef {Object} ScenarioContext
 * @property {import('pg').Pool} pool
 * @property {(text: string, params?: unknown[]) => Promise<import('pg').QueryResult>} query
 * @property {import('../config.mjs').config} config
 * @property {string[]} createdRoomIds
 */

/**
 * @typedef {Object} ScenarioResult
 * @property {string} id
 * @property {string} title
 * @property {string} engine
 * @property {'PASS'|'FAIL'|'SKIP'} status
 * @property {string|null} roomId
 * @property {string|null} sessionId
 * @property {number} durationMs
 * @property {string|null} mismatch
 * @property {ValidationIssue[]} issues
 * @property {string} [skipReason]
 * @property {Record<string, unknown>} [detail]
 */

/**
 * @typedef {Object} Scenario
 * @property {string} id
 * @property {string} title
 * @property {string} engine
 * @property {(ctx: ScenarioContext) => Promise<Partial<ScenarioResult> & { validation?: ValidationResult }>} run
 */

export {};
