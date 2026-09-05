import type { Logger } from "../metrics/logger.js";
import {
  buildLegacyWorkerGateLogPayload,
  classifyBulkHistoryDrawJobs,
  type LegacyDrawGateSnapshot,
  type LegacyDingGateSnapshot,
  type LegacyWorkerGateDecision,
  resolveLegacyDrawProcessorGate,
  resolveLegacyDingProcessorGate,
} from "../coordination/legacyWorkerGate.js";

export interface LegacyWorkerGateControllerOptions<TSnapshot> {
  worker: "drawProcessor" | "dingProcessor";
  resolveConfigEnabled: () => boolean;
  heartbeatMs: number;
  log: Logger;
  fetchSnapshot: () => Promise<TSnapshot>;
  resolve: (
    configEnabled: boolean,
    snapshot: TSnapshot
  ) => LegacyWorkerGateDecision;
  startWorker: () => () => void;
  bulkHistoryClassifier?: (snapshot: TSnapshot) => string;
}

export function startLegacyWorkerWithGate<TSnapshot>(
  opts: LegacyWorkerGateControllerOptions<TSnapshot>
): () => void {
  let stopped = false;
  let innerStop: (() => void) | null = null;
  let lastDecision: LegacyWorkerGateDecision | null = null;
  let lastLoggedSignature = "";

  const logDecision = (decision: LegacyWorkerGateDecision, snapshot: TSnapshot) => {
    const bulkHistory =
      opts.bulkHistoryClassifier?.(snapshot) ?? undefined;
    const payload = buildLegacyWorkerGateLogPayload(
      opts.worker,
      decision,
      bulkHistory
    );
    const signature = JSON.stringify({
      enabled: payload.enabled,
      reason: payload.reason,
      refusalReason: payload.refusalReason,
      workerStarted: payload.workerStarted,
      workerIdle: payload.workerIdle,
      activePerDrawRooms: payload.activePerDrawRooms,
      drawJobsPending: payload.drawJobsPending,
      dingJobsPending: payload.dingJobsPending,
    });
    if (signature === lastLoggedSignature) return;
    lastLoggedSignature = signature;
    opts.log.info("[LegacyWorkerGate]", { ...payload });
  };

  const applyDecision = async (): Promise<void> => {
    if (stopped) return;

    let snapshot: TSnapshot;
    try {
      snapshot = await opts.fetchSnapshot();
    } catch (err) {
      opts.log.warn("[LegacyWorkerGate] snapshot error — keeping worker active", {
        worker: opts.worker,
        error: err instanceof Error ? err.message : String(err),
      });
      if (!innerStop) {
        innerStop = opts.startWorker();
      }
      return;
    }

    const decision = opts.resolve(opts.resolveConfigEnabled(), snapshot);
    lastDecision = decision;
    logDecision(decision, snapshot);

    if (decision.effectiveEnabled) {
      if (!innerStop) {
        innerStop = opts.startWorker();
      }
      return;
    }

    if (innerStop) {
      innerStop();
      innerStop = null;
    }
  };

  void applyDecision();
  const heartbeatId = setInterval(() => void applyDecision(), opts.heartbeatMs);

  return () => {
    stopped = true;
    clearInterval(heartbeatId);
    innerStop?.();
    innerStop = null;
    if (lastDecision) {
      opts.log.info("[LegacyWorkerGate] stopped", {
        worker: opts.worker,
        lastReason: lastDecision.reason,
      });
    }
  };
}

export function createDrawProcessorGateOptions(input: {
  resolveConfigEnabled: () => boolean;
  heartbeatMs: number;
  log: Logger;
  fetchSnapshot: () => Promise<LegacyDrawGateSnapshot>;
  startWorker: () => () => void;
}): LegacyWorkerGateControllerOptions<LegacyDrawGateSnapshot> {
  return {
    worker: "drawProcessor",
    resolveConfigEnabled: input.resolveConfigEnabled,
    heartbeatMs: input.heartbeatMs,
    log: input.log,
    fetchSnapshot: input.fetchSnapshot,
    resolve: resolveLegacyDrawProcessorGate,
    startWorker: input.startWorker,
    bulkHistoryClassifier: classifyBulkHistoryDrawJobs,
  };
}

export function createDingProcessorGateOptions(input: {
  resolveConfigEnabled: () => boolean;
  heartbeatMs: number;
  log: Logger;
  fetchSnapshot: () => Promise<LegacyDingGateSnapshot>;
  startWorker: () => () => void;
}): LegacyWorkerGateControllerOptions<LegacyDingGateSnapshot> {
  return {
    worker: "dingProcessor",
    resolveConfigEnabled: input.resolveConfigEnabled,
    heartbeatMs: input.heartbeatMs,
    log: input.log,
    fetchSnapshot: input.fetchSnapshot,
    resolve: resolveLegacyDingProcessorGate,
    startWorker: input.startWorker,
  };
}
