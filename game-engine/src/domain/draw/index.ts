/**
 * Draw domain: draw_jobs consumption, marks, win evaluation.
 * Phase 1 (hybrid): orchestration in TS, game/finance logic stays in DB RPCs.
 * Migrated incrementally from: rpc_apply_marks_for_draw, fn_evaluate_room_after_draw
 * (see docs/roadmap/GAME_ENGINE_MIGRATION.md — P0→P3).
 */

export { processDrawBatch } from "./processDrawBatch.js";
export type { ProcessDrawBatchOptions } from "./processDrawBatch.js";
export { processDrawBatchEngine } from "./processDrawBatchEngine.js";
export type { ProcessDrawBatchEngineOptions } from "./processDrawBatchEngine.js";
export { applyMarksAndEvaluate, applyMarksAndEvaluateWithState } from "./evaluateDraw.js";
export { groupJobsByRoom, processJobsByRoom } from "./processJobsByRoom.js";
export { pickDrawJobs } from "./pickDrawJobs.js";
export { reapStaleDrawJobs } from "./reapStaleJobs.js";
export { EMPTY_BATCH } from "./types.js";
export type { DrawBatchResult, DrawJob } from "./types.js";
