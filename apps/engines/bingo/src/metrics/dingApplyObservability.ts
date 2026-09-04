import type { Logger } from "./logger.js";

export const DING_APPLY_LOG = "[DingApply]";

export type DingApplyOutcome =
  | "attempt"
  | "done"
  | "skipped"
  | "error";

export interface DingApplyFields {
  jobId: number;
  roomId: string;
  drawNumber: number;
  outcome: DingApplyOutcome;
  queueLagMs?: number;
  applyRpcMs?: number;
  attempt?: number;
  creditCount?: number;
  usersCredited?: number;
  error?: string;
}

export function roundDingApplyMs(n: number): number {
  return Math.round(n * 100) / 100;
}

export function nowDingApplyMs(): number {
  return performance.now();
}

export function elapsedDingApplyMs(startedAt: number): number {
  return roundDingApplyMs(performance.now() - startedAt);
}

export function dingApplyMeta(
  fields: DingApplyFields
): Record<string, unknown> {
  return {
    jobId: fields.jobId,
    roomId: fields.roomId,
    drawNumber: fields.drawNumber,
    outcome: fields.outcome,
    queueLagMs: fields.queueLagMs ?? null,
    applyRpcMs: fields.applyRpcMs ?? null,
    attempt: fields.attempt ?? null,
    creditCount: fields.creditCount ?? null,
    usersCredited: fields.usersCredited ?? null,
    error: fields.error ?? null,
  };
}

export function logDingApply(log: Logger, fields: DingApplyFields): void {
  const meta = dingApplyMeta(fields);
  if (fields.outcome === "error") {
    log.warn(DING_APPLY_LOG, meta);
    return;
  }
  log.info(DING_APPLY_LOG, meta);
}
