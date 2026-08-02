import type { DevPlayerRepo } from "../../repositories/devPlayerRepo.js";
import type { Logger } from "../../metrics/logger.js";

export const DEFAULT_PROCESSING_STUCK_TIMEOUT_SECONDS = 120;

export async function requeueStuckProcessingSchedules(
  repo: DevPlayerRepo,
  log: Logger,
  stuckTimeoutSeconds: number,
  now: Date = new Date()
): Promise<number> {
  if (!Number.isInteger(stuckTimeoutSeconds) || stuckTimeoutSeconds < 30) {
    return 0;
  }

  const requeued = await repo.requeueStuckProcessingSchedules(stuckTimeoutSeconds, now);
  if (requeued > 0) {
    log.warn("dev-player-processor requeued stuck jobs", {
      requeued,
      stuckTimeoutSeconds,
    });
  }
  return requeued;
}
