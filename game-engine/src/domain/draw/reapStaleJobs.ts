/**
 * Recover draw_jobs stuck in `processing` after engine crash or OOM.
 * Source of truth remains DB; memory state for affected rooms is evicted.
 */

import type { Logger } from "../../metrics/logger.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";

export interface ReapStaleJobsResult {
  requeued: number;
  roomIds: string[];
}

export async function reapStaleDrawJobs(args: {
  repo: GameRepo;
  log: Logger;
  staleSec: number;
  roomState?: RoomStateManager;
}): Promise<ReapStaleJobsResult> {
  try {
    const { requeued, roomIds } = await args.repo.requeueStaleProcessingJobs(
      args.staleSec
    );
    if (requeued > 0) {
      for (const roomId of roomIds) {
        args.roomState?.evict(roomId);
      }
      args.log.warn("requeued stale draw_jobs", {
        requeued,
        roomIds,
        staleSec: args.staleSec,
      });
    }
    return { requeued, roomIds };
  } catch (err) {
    args.log.warn("reapStaleDrawJobs skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { requeued: 0, roomIds: [] };
  }
}
