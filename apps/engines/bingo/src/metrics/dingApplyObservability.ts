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

export const DING_APPLY_HEALTH_LOG = "[DingApplyHealth]";

export interface DingApplyHealthSnapshot {
  queuedCount: number;
  processingCount: number;
  failedCount: number;
  oldestQueuedAgeMs: number;
  oldestProcessingAgeMs: number;
  staleQueuedCount: number;
  staleProcessingCount: number;
  processedDingGapCount: number;
  historicalGapCount: number;
  applyErrorCount: number;
  applyRetryCount: number;
}

export function dingApplyHealthMeta(
  snapshot: DingApplyHealthSnapshot
): Record<string, unknown> {
  return {
    queuedCount: snapshot.queuedCount,
    processingCount: snapshot.processingCount,
    failedCount: snapshot.failedCount,
    oldestQueuedAgeMs: snapshot.oldestQueuedAgeMs,
    oldestProcessingAgeMs: snapshot.oldestProcessingAgeMs,
    staleQueuedCount: snapshot.staleQueuedCount,
    staleProcessingCount: snapshot.staleProcessingCount,
    processedDingGapCount: snapshot.processedDingGapCount,
    historicalGapCount: snapshot.historicalGapCount,
    applyErrorCount: snapshot.applyErrorCount,
    applyRetryCount: snapshot.applyRetryCount,
    queueLagWarningMs: 30_000,
    staleQueuedThresholdMs: 300_000,
  };
}

export function logDingApplyHealth(
  log: Logger,
  snapshot: DingApplyHealthSnapshot
): void {
  const meta = dingApplyHealthMeta(snapshot);
  const critical =
    snapshot.failedCount > 0 ||
    snapshot.staleQueuedCount > 0 ||
    snapshot.staleProcessingCount > 0 ||
    snapshot.historicalGapCount > 0 ||
    snapshot.oldestQueuedAgeMs > 30_000;
  if (critical) {
    log.warn(DING_APPLY_HEALTH_LOG, meta);
    return;
  }
  log.info(DING_APPLY_HEALTH_LOG, meta);
}
