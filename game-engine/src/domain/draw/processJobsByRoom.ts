import type { DrawBatchResult, DrawJob } from "./types.js";

export type JobOutcome = "done" | "requeue" | "dead-letter";

/** Group picked jobs by room; preserve per-room draw order. */
export function groupJobsByRoom(jobs: DrawJob[]): Map<string, DrawJob[]> {
  const byRoom = new Map<string, DrawJob[]>();
  for (const job of jobs) {
    const list = byRoom.get(job.room_id) ?? [];
    list.push(job);
    byRoom.set(job.room_id, list);
  }
  for (const list of byRoom.values()) {
    list.sort((a, b) => a.draw_number - b.draw_number);
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
  processJob: (job: DrawJob) => Promise<JobOutcome>
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

      for (const job of roomQueues[idx]!) {
        const outcome = await processJob(job);
        if (outcome === "done") result.done += 1;
        else if (outcome === "requeue") result.requeued += 1;
        else result.deadLettered += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return result;
}
