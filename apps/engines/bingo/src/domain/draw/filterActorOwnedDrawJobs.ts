/**
 * draw-processor must not evaluate actor-owned rooms — the room-loop actor
 * inserts and finalizes draws inline. Jobs still enqueue via trg_after_draw_enqueue;
 * this filter clears them without double-processing.
 */
import type { Logger } from "../../metrics/logger.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomRow } from "../../repositories/types.js";
import type { DrawJob } from "./types.js";

export interface ActorJobFilterResult {
  toProcess: DrawJob[];
  skippedDone: number;
  skippedRequeued: number;
}

/** Playing rooms are driven by the room-loop actor in engine runtime. */
export function isActorOwnedLiveRoom(
  room: Pick<RoomRow, "status"> | null
): boolean {
  return room?.status === "playing";
}

export function partitionActorOwnedJobs(
  jobs: DrawJob[],
  roomById: Map<string, Pick<RoomRow, "status"> | null>,
  processedDrawNumbersByRoom: Map<string, Set<number>>
): { toProcess: DrawJob[]; markDone: DrawJob[]; requeue: DrawJob[] } {
  const toProcess: DrawJob[] = [];
  const markDone: DrawJob[] = [];
  const requeue: DrawJob[] = [];

  for (const job of jobs) {
    const room = roomById.get(job.room_id);
    if (!room || !isActorOwnedLiveRoom(room)) {
      toProcess.push(job);
      continue;
    }
    const processed = processedDrawNumbersByRoom.get(job.room_id);
    if (processed?.has(job.draw_number)) {
      markDone.push(job);
    } else {
      requeue.push(job);
    }
  }

  return { toProcess, markDone, requeue };
}

/** Drop or clear jobs for rooms driven by the room-actor loop. */
export async function filterActorOwnedDrawJobs(
  repo: GameRepo,
  log: Logger,
  jobs: DrawJob[]
): Promise<ActorJobFilterResult> {
  if (jobs.length === 0) {
    return { toProcess: [], skippedDone: 0, skippedRequeued: 0 };
  }

  const roomIds = [...new Set(jobs.map((j) => j.room_id))];
  const roomById = new Map<string, Pick<RoomRow, "status"> | null>();
  await Promise.all(
    roomIds.map(async (id) => {
      const room = await repo.getRoom(id);
      roomById.set(id, room ? { status: room.status } : null);
    })
  );

  const processedDrawNumbersByRoom = new Map<string, Set<number>>();
  for (const roomId of roomIds) {
    const room = roomById.get(roomId);
    if (!room || !isActorOwnedLiveRoom(room)) continue;
    const numbers = jobs
      .filter((j) => j.room_id === roomId)
      .map((j) => j.draw_number);
    processedDrawNumbersByRoom.set(
      roomId,
      await repo.getProcessedDrawNumbers(roomId, numbers)
    );
  }

  const { toProcess, markDone, requeue } = partitionActorOwnedJobs(
    jobs,
    roomById,
    processedDrawNumbersByRoom
  );

  if (markDone.length > 0) {
    await repo.completeDrawJobs(markDone.map((j) => j.id));
  }
  if (requeue.length > 0) {
    await repo.requeueDrawJobsById(requeue.map((j) => j.id));
  }

  if (markDone.length > 0 || requeue.length > 0) {
    log.info("draw-processor skip actor-owned jobs", {
      picked: jobs.length,
      markedDone: markDone.length,
      requeued: requeue.length,
      toProcess: toProcess.length,
    });
  }

  return {
    toProcess,
    skippedDone: markDone.length,
    skippedRequeued: requeue.length,
  };
}
