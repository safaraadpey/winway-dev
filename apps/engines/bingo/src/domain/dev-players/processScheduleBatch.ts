import type { DevPlayerRepo } from "../../repositories/devPlayerRepo.js";
import type { Logger } from "../../metrics/logger.js";
import { requeueStuckProcessingSchedules } from "./requeueStuckProcessingSchedules.js";
import type { ProcessScheduleBatchResult } from "./types.js";

export async function processScheduleBatch(
  repo: DevPlayerRepo,
  log: Logger,
  limit: number,
  stuckTimeoutSeconds: number
): Promise<ProcessScheduleBatchResult> {
  const requeued = await requeueStuckProcessingSchedules(repo, log, stuckTimeoutSeconds);

  const jobs = await repo.pickSchedules(limit);
  if (jobs.length === 0) {
    return { processed: 0, failed: 0, requeued };
  }

  let processed = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  for (const job of jobs) {
    try {
      const joinResult = await repo.systemJoinOrCreateRoom({
        userId: job.user_id,
        templateId: job.room_template_id,
        cardCount: job.ticket_count,
      });

      await repo.markScheduleDone({
        scheduleId: job.id,
        roomId: joinResult.roomId,
        ticketIds: joinResult.ticketIds,
        processedAt: nowIso,
      });
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await repo.markScheduleFailed({
        scheduleId: job.id,
        error: message,
        processedAt: nowIso,
      });
      failed += 1;
      log.warn("dev-player schedule join failed", {
        scheduleId: job.id,
        userId: job.user_id,
        templateId: job.room_template_id,
        error: message,
      });
    }
  }

  if (processed > 0 || failed > 0 || requeued > 0) {
    log.info("dev-player-processor batch", {
      processed,
      failed,
      requeued,
      picked: jobs.length,
    });
  }

  return { processed, failed, requeued };
}
