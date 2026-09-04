import type { Logger } from "../../metrics/logger.js";
import type { GameRepo } from "../../repositories/index.js";

export async function reapStaleDingApplyJobs(args: {
  repo: GameRepo;
  log: Logger;
  staleSec: number;
}): Promise<{ requeued: number; completed: number }> {
  const result = await args.repo.reapStaleDingApplyJobs(args.staleSec);
  if (result.requeued > 0 || result.completed > 0) {
    args.log.info("[DingApply] reaped stale jobs", {
      requeued: result.requeued,
      completed: result.completed,
      staleSec: args.staleSec,
    });
  }
  return result;
}
