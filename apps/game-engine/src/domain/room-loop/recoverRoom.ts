/**
 * Crash recovery for the room-actor loop.
 *
 * Invariant: never insert a new draw while an earlier one is unprocessed.
 * If the actor (or a previous owner) crashed after inserting a draw but before
 * finalizing it, the draw sits with processed_at IS NULL. On every cycle we
 * process the OLDEST such draw first (insert order), reusing the exact same
 * processing path as the queue (processEngineDrawJob → finalize → settle).
 */
import { processEngineDrawJob } from "../draw/processEngineDrawJob.js";
import type { DrawJob } from "../draw/types.js";
import type { RoomGameActor } from "../../workers/room-loop/roomGameActor.js";

export type RecoverOutcome = "none" | "processed" | "requeue";

export async function recoverRoom(
  actor: RoomGameActor
): Promise<RecoverOutcome> {
  if (!actor.needsRecovery) {
    return "none";
  }

  const oldest = await actor.repo.getOldestUnprocessedDraw(actor.roomId);
  if (!oldest) {
    actor.clearNeedsRecovery();
    return "none";
  }

  actor.metrics.noteRecovery();

  const jobId =
    (await actor.repo.getDrawJobId(actor.roomId, oldest.number)) ?? -1;
  const job: DrawJob = {
    id: jobId,
    room_id: actor.roomId,
    draw_number: oldest.number,
    status: "processing",
    attempts: 0,
    created_at: oldest.created_at,
    updated_at: oldest.created_at,
  };

  const nowIso = new Date().toISOString();
  const outcome = await processEngineDrawJob(
    actor.supabase,
    actor.log,
    actor.repo,
    actor.stateManager,
    job,
    {
      maxAttempts: actor.config.drawProcessorMaxAttempts,
      cardRegistry: actor.cardRegistry,
      pickContext: {
        firstPickedAt: nowIso,
        pickStartTime: nowIso,
        pickEndTime: nowIso,
        pickMsPerJob: 0,
        drainStartedAt: nowIso,
      },
      skipExistingCheck: true,
      actorTiming: true,
      leaseFence: actor.leaseFence,
    }
  );

  if (outcome === "fenced") {
    return "requeue";
  }

  if (outcome === "done") {
    actor.clearNeedsRecovery();
    return "processed";
  }
  return "requeue";
}
