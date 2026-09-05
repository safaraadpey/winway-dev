/**
 * R8B-2: Non-destructive config gates for legacy draw/ding processors.
 * Defaults remain enabled (true). Disabling is fail-closed when work remains.
 */

export interface LegacyDrawGateSnapshot {
  activePerDrawRooms: number;
  drawJobsQueued: number;
  drawJobsProcessing: number;
  drawJobsFailed: number;
  /** Queued/processing/failed jobs on finished/cancelled manifest_ram rooms (bulk history). */
  terminalManifestRamDrawJobsPending: number;
}

export interface LegacyDingGateSnapshot {
  activePerDrawDingRooms: number;
  dingJobsQueued: number;
  dingJobsProcessing: number;
  dingJobsFailed: number;
}

export interface LegacyWorkerGateDecision {
  configEnabled: boolean;
  effectiveEnabled: boolean;
  workerStarted: boolean;
  workerIdle: boolean;
  reason: string;
  refusalReason: string | null;
  activePerDrawRooms: number;
  drawJobsPending: number;
  dingJobsPending: number;
}

export function parseLegacyDrawProcessorEnabled(
  raw: string | undefined
): boolean {
  return raw !== "false";
}

export function parseLegacyDingProcessorEnabled(
  raw: string | undefined
): boolean {
  return raw !== "false";
}

export function drawJobsPendingTotal(snapshot: LegacyDrawGateSnapshot): number {
  return (
    snapshot.drawJobsQueued +
    snapshot.drawJobsProcessing +
    snapshot.drawJobsFailed
  );
}

export function dingJobsPendingTotal(snapshot: LegacyDingGateSnapshot): number {
  return (
    snapshot.dingJobsQueued +
    snapshot.dingJobsProcessing +
    snapshot.dingJobsFailed
  );
}

export function resolveLegacyDrawProcessorGate(
  configEnabled: boolean,
  snapshot: LegacyDrawGateSnapshot
): LegacyWorkerGateDecision {
  const drawJobsPending = drawJobsPendingTotal(snapshot);

  if (configEnabled) {
    return {
      configEnabled: true,
      effectiveEnabled: true,
      workerStarted: true,
      workerIdle: false,
      reason: "config_enabled",
      refusalReason: null,
      activePerDrawRooms: snapshot.activePerDrawRooms,
      drawJobsPending,
      dingJobsPending: 0,
    };
  }

  const blockers: string[] = [];
  if (snapshot.activePerDrawRooms > 0) {
    blockers.push(`active_per_draw_rooms=${snapshot.activePerDrawRooms}`);
  }
  if (snapshot.drawJobsQueued > 0) {
    blockers.push(`draw_jobs_queued=${snapshot.drawJobsQueued}`);
  }
  if (snapshot.drawJobsProcessing > 0) {
    blockers.push(`draw_jobs_processing=${snapshot.drawJobsProcessing}`);
  }
  if (snapshot.drawJobsFailed > 0) {
    blockers.push(`draw_jobs_failed=${snapshot.drawJobsFailed}`);
  }

  if (blockers.length > 0) {
    return {
      configEnabled: false,
      effectiveEnabled: true,
      workerStarted: true,
      workerIdle: false,
      reason: "fail_closed_keep_active",
      refusalReason: blockers.join("; "),
      activePerDrawRooms: snapshot.activePerDrawRooms,
      drawJobsPending,
      dingJobsPending: 0,
    };
  }

  return {
    configEnabled: false,
    effectiveEnabled: false,
    workerStarted: false,
    workerIdle: true,
    reason: "gate_disabled_idle",
    refusalReason: null,
    activePerDrawRooms: 0,
    drawJobsPending: 0,
    dingJobsPending: 0,
  };
}

export function resolveLegacyDingProcessorGate(
  configEnabled: boolean,
  snapshot: LegacyDingGateSnapshot
): LegacyWorkerGateDecision {
  const dingJobsPending = dingJobsPendingTotal(snapshot);

  if (configEnabled) {
    return {
      configEnabled: true,
      effectiveEnabled: true,
      workerStarted: true,
      workerIdle: false,
      reason: "config_enabled",
      refusalReason: null,
      activePerDrawRooms: snapshot.activePerDrawDingRooms,
      drawJobsPending: 0,
      dingJobsPending,
    };
  }

  const blockers: string[] = [];
  if (snapshot.activePerDrawDingRooms > 0) {
    blockers.push(
      `active_per_draw_ding_rooms=${snapshot.activePerDrawDingRooms}`
    );
  }
  if (snapshot.dingJobsQueued > 0) {
    blockers.push(`ding_jobs_queued=${snapshot.dingJobsQueued}`);
  }
  if (snapshot.dingJobsProcessing > 0) {
    blockers.push(`ding_jobs_processing=${snapshot.dingJobsProcessing}`);
  }
  if (snapshot.dingJobsFailed > 0) {
    blockers.push(`ding_jobs_failed=${snapshot.dingJobsFailed}`);
  }

  if (blockers.length > 0) {
    return {
      configEnabled: false,
      effectiveEnabled: true,
      workerStarted: true,
      workerIdle: false,
      reason: "fail_closed_keep_active",
      refusalReason: blockers.join("; "),
      activePerDrawRooms: snapshot.activePerDrawDingRooms,
      drawJobsPending: 0,
      dingJobsPending,
    };
  }

  return {
    configEnabled: false,
    effectiveEnabled: false,
    workerStarted: false,
    workerIdle: true,
    reason: "gate_disabled_idle",
    refusalReason: null,
    activePerDrawRooms: 0,
    drawJobsPending: 0,
    dingJobsPending: 0,
  };
}

export function classifyBulkHistoryDrawJobs(
  snapshot: LegacyDrawGateSnapshot
): string {
  if (snapshot.terminalManifestRamDrawJobsPending <= 0) {
    return "none_pending";
  }
  if (
    snapshot.activePerDrawRooms === 0 &&
    snapshot.drawJobsQueued === snapshot.terminalManifestRamDrawJobsPending
  ) {
    return "terminal_manifest_ram_noop_drain_only";
  }
  return "terminal_manifest_ram_mixed_or_active_drain";
}

export interface LegacyWorkerGateLogPayload {
  worker: "drawProcessor" | "dingProcessor";
  enabled: boolean;
  configEnabled: boolean;
  reason: string;
  activePerDrawRooms: number;
  drawJobsPending: number;
  dingJobsPending: number;
  workerStarted: boolean;
  workerIdle: boolean;
  refusalReason: string | null;
  bulkHistoryDrawJobBehavior?: string;
}

export function buildLegacyWorkerGateLogPayload(
  worker: "drawProcessor" | "dingProcessor",
  decision: LegacyWorkerGateDecision,
  bulkHistoryDrawJobBehavior?: string
): LegacyWorkerGateLogPayload {
  return {
    worker,
    enabled: decision.effectiveEnabled,
    configEnabled: decision.configEnabled,
    reason: decision.reason,
    activePerDrawRooms: decision.activePerDrawRooms,
    drawJobsPending: decision.drawJobsPending,
    dingJobsPending: decision.dingJobsPending,
    workerStarted: decision.workerStarted,
    workerIdle: decision.workerIdle,
    refusalReason: decision.refusalReason,
    ...(bulkHistoryDrawJobBehavior
      ? { bulkHistoryDrawJobBehavior }
      : undefined),
  };
}
