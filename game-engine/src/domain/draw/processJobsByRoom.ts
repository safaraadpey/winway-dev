import { randomUUID } from "node:crypto";
import type { DrawBatchResult, DrawJob } from "./types.js";
import type { GameRedis } from "../../redis/types.js";
import { tryAcquireLock, releaseLock } from "../../redis/locks.js";

export type JobOutcome = "done" | "requeue" | "dead-letter" | "fenced";

export interface RoomLockOptions {
  redis: GameRedis;
  ttlSec: number;
  keyFn: (roomId: string) => string;
  /** Jobs stay `processing` until requeued when another replica holds the room lock. */
  onLockMiss?: (roomId: string, jobs: readonly DrawJob[]) => Promise<void>;
}

/** Group picked jobs by room; process lowest draw_number first per room. */
export function groupJobsByRoom(jobs: DrawJob[]): Map<string, DrawJob[]> {
  const byRoom = new Map<string, DrawJob[]>();
  for (const job of jobs) {
    const list = byRoom.get(job.room_id) ?? [];
    list.push(job);
    byRoom.set(job.room_id, list);
  }
  for (const list of byRoom.values()) {
    list.sort(
      (a, b) =>
        a.draw_number - b.draw_number ||
        a.created_at.localeCompare(b.created_at) ||
        a.id - b.id
    );
  }
  return byRoom;
}

/**
 * Process jobs in parallel across rooms, serially within each room.
 * roomConcurrency caps how many rooms drain at once (limits RPC pressure).
 */
export async function processJobsByRoom(
  jobs: DrawJob[],
  roomConcurrency: number,
  processJob: (job: DrawJob) => Promise<JobOutcome>,
  roomLock?: RoomLockOptions
): Promise<Pick<DrawBatchResult, "done" | "requeued" | "deadLettered">> {
  const result = { done: 0, requeued: 0, deadLettered: 0 };
  if (jobs.length === 0) return result;

  const roomQueues = [...groupJobsByRoom(jobs).values()];
  const concurrency = Math.max(1, Math.min(roomConcurrency, roomQueues.length));

  let nextRoom = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const idx = nextRoom++;
      if (idx >= roomQueues.length) return;

      const queue = roomQueues[idx]!;
      const roomId = queue[0]?.room_id;
      if (!roomId) continue;

      let lockToken: string | null = null;
      let lockHeld = false;

      if (roomLock) {
        lockToken = randomUUID();
        try {
          lockHeld = await tryAcquireLock(
            roomLock.redis,
            roomLock.keyFn(roomId),
            roomLock.ttlSec,
            lockToken
          );
          if (!lockHeld) {
            if (roomLock.onLockMiss) {
              await roomLock.onLockMiss(roomId, queue);
              result.requeued += queue.length;
            }
            continue;
          }
        } catch {
          lockHeld = false;
          lockToken = null;
        }
      }

      try {
        for (const job of queue) {
          const outcome = await processJob(job);
          if (outcome === "done") result.done += 1;
          else if (outcome === "requeue") result.requeued += 1;
          else result.deadLettered += 1;
        }
      } finally {
        if (roomLock && lockHeld && lockToken) {
          await releaseLock(roomLock.redis, roomLock.keyFn(roomId), lockToken).catch(
            () => undefined
          );
        }
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return result;
}
