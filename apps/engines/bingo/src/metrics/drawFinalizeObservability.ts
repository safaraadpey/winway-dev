/**
 * Low-risk draw-finalize observability (Phase 1).
 * Client-side timings only — does not change RPC/SQL behavior.
 *
 * Intra-RPC splits (FOR UPDATE wait, marks vs ding vs triggers) are not
 * measurable without changing rpc_finalize_engine_draw_job.
 */
import type { Logger } from "./logger.js";

export const DRAW_FINALIZE_LOG = "[DrawFinalize]";

export type DrawFinalizeOwner =
  | "ram-clock-persist"
  | "draw-processor"
  | "recovery";

export type DrawFinalizeOutcome =
  | "attempt"
  | "done"
  | "duplicate"
  | "fenced"
  | "error";

export interface DrawFinalizeFields {
  owner: DrawFinalizeOwner;
  roomId: string;
  drawNumber: number;
  jobId: number;
  outcome: DrawFinalizeOutcome;
  queueWaitMs?: number;
  insertRpcMs?: number;
  finalizeRpcMs?: number;
  markCount?: number;
  resultCount?: number;
  dingCreditCount?: number;
  dingUsersCredited?: number;
  alreadyProcessed?: boolean;
}

export function roundFinalizeMs(n: number): number {
  return Math.round(n * 100) / 100;
}

export function nowFinalizeMs(): number {
  return performance.now();
}

export function elapsedFinalizeMs(startedAt: number): number {
  return roundFinalizeMs(performance.now() - startedAt);
}

/** Stable correlated payload for [DrawFinalize] logs. */
export function drawFinalizeMeta(
  fields: DrawFinalizeFields
): Record<string, unknown> {
  return {
    owner: fields.owner,
    roomId: fields.roomId,
    drawNumber: fields.drawNumber,
    jobId: fields.jobId,
    outcome: fields.outcome,
    queueWaitMs: fields.queueWaitMs ?? null,
    insertRpcMs: fields.insertRpcMs ?? null,
    finalizeRpcMs: fields.finalizeRpcMs ?? null,
    markCount: fields.markCount ?? null,
    resultCount: fields.resultCount ?? null,
    dingCreditCount: fields.dingCreditCount ?? null,
    dingUsersCredited: fields.dingUsersCredited ?? null,
    alreadyProcessed: fields.alreadyProcessed === true,
    lockWaitMs: null,
    marksResultsMs: null,
    triggerDingMs: null,
  };
}

export function logDrawFinalize(
  log: Logger,
  fields: DrawFinalizeFields
): void {
  const meta = drawFinalizeMeta(fields);
  if (fields.outcome === "fenced" || fields.outcome === "error") {
    log.warn(DRAW_FINALIZE_LOG, meta);
    return;
  }
  if (fields.outcome === "duplicate") {
    log.warn(DRAW_FINALIZE_LOG, meta);
    return;
  }
  log.info(DRAW_FINALIZE_LOG, meta);
}
