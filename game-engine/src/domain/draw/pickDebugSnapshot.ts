import type { Logger } from "../../metrics/logger.js";
import type { GameRepo } from "../../repositories/index.js";
import type { DrawProcessorWakeReason } from "../../runtime/draw-processor-wake.js";

export type PickDebugWakeReason = "enqueue" | "poll" | "realtime" | "recovery";

export interface PickDebugSchedulingFlags {
  inFlight: boolean;
  pendingDrain: boolean;
  lockState: "proceed" | "fail";
}

export interface PickDebugContext {
  workerId: string;
  getWakeReason: () => DrawProcessorWakeReason;
  getFlags: () => PickDebugSchedulingFlags;
}

function mapWakeReason(reason: DrawProcessorWakeReason): PickDebugWakeReason {
  return reason === "backlog" ? "recovery" : reason;
}

/** Live DB snapshot + scheduling flags immediately before rpc_pick_draw_jobs. */
export async function emitPickDebugSnapshot(
  log: Logger,
  repo: GameRepo,
  pickDebug: PickDebugContext,
  batchSize: number
): Promise<void> {
  const [queueState, flags] = await Promise.all([
    repo.fetchPickDebugQueueState(),
    Promise.resolve(pickDebug.getFlags()),
  ]);

  log.info("pick_debug_snapshot", {
    timestamp: new Date().toISOString(),
    worker_id: pickDebug.workerId,
    wake_reason: mapWakeReason(pickDebug.getWakeReason()),
    inFlight: flags.inFlight,
    pendingDrain: flags.pendingDrain,
    lock_state: flags.lockState,
    queued_jobs_count: queueState.queuedJobsCount,
    processing_jobs_count: queueState.processingJobsCount,
    oldest_queued_age_ms: queueState.oldestQueuedAgeMs,
    oldest_processing_age_ms: queueState.oldestProcessingAgeMs,
    active_rooms_count: queueState.activeRoomsCount,
    batch_size_to_process: batchSize,
  });
}
