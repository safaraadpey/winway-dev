/**
 * Persist recorder — insert + finalize from an immutable ClockDrawPayload.
 * Must not re-pick, re-evaluate, or restamp draw cadence times.
 */
import { settleRoomIfNeeded } from "../../finance/settleRoom.js";
import {
  elapsedFinalizeMs,
  logDrawFinalize,
  nowFinalizeMs,
} from "../../metrics/drawFinalizeObservability.js";
import type { EngineJobOutcome } from "../draw/processEngineDrawJob.js";
import type { RoomGameActor } from "../../workers/room-loop/roomGameActor.js";
import {
  assertClockTimestamps,
  type ClockDrawPayload,
} from "./clockDrawPayload.js";
import { drawIntervalSec } from "./scheduleNextDraw.js";

export async function persistClockDrawPayload(
  actor: RoomGameActor,
  payload: ClockDrawPayload
): Promise<EngineJobOutcome> {
  assertClockTimestamps(payload);

  const { repo, supabase, log, stateManager, roomId } = actor;
  const state = await stateManager.ensureLoaded(roomId);
  const intervalSec = drawIntervalSec(actor.room.meta);

  const existing = await repo.getDraw(roomId, payload.number);
  let jobId = -1;

  if (existing?.processed_at) {
    logDrawFinalize(log, {
      owner: "ram-clock-persist",
      roomId,
      drawNumber: payload.number,
      jobId: -1,
      outcome: "duplicate",
      alreadyProcessed: true,
    });
    state.recordDrawProcessed(payload.number);
    return "done";
  }

  let insertRpcMs: number | undefined;
  if (!existing) {
    const insertStarted = nowFinalizeMs();
    const insertResult = await repo.insertDrawIfReadyForOwner({
      roomId,
      number: payload.number,
      nowIso: payload.drawnAtIso,
      nextDrawAtIso: payload.nextDueAtIso,
      ownerId: actor.ownerId,
      drawIntervalSec: intervalSec,
      actorDueAtIso: payload.actorDueAtIso,
      leaseEpoch: actor.leaseFence.leaseEpoch,
      maxUnprocessed: actor.config.roomLoopMaxUnprocessedDraws,
    });
    insertRpcMs = elapsedFinalizeMs(insertStarted);

    switch (insertResult.outcome) {
      case "not_owner":
        return "fenced";
      case "not_playing":
      case "exhausted":
        return "done";
      case "backpressure":
        return "requeue";
      case "duplicate":
        jobId = (await repo.getDrawJobId(roomId, payload.number)) ?? -1;
        log.warn("[DrawFinalize] insert unique_violation — another writer already inserted", {
          owner: "ram-clock-persist",
          roomId,
          drawNumber: payload.number,
          jobId,
        });
        break;
      case "inserted":
        actor.metrics.noteDrawInserted();
        jobId = insertResult.jobId ?? -1;
        if (insertResult.nextDrawAtIso) {
          actor.room = {
            ...actor.room,
            next_draw_at: insertResult.nextDrawAtIso,
          };
        }
        break;
    }
  } else {
    jobId = (await repo.getDrawJobId(roomId, payload.number)) ?? -1;
  }

  const persistStartedMs = Date.now();
  const handlerStartedAt = new Date(persistStartedMs).toISOString();
  const actorFinalizeStartedAt = handlerStartedAt;
  const queueWaitMs = Math.max(0, persistStartedMs - Date.parse(payload.drawnAtIso));
  const markCount = payload.persistence.marks.length;
  const resultCount = payload.persistence.results.length;
  const dingCreditCount = payload.ding.credits.length;

  logDrawFinalize(log, {
    owner: "ram-clock-persist",
    roomId,
    drawNumber: payload.number,
    jobId,
    outcome: "attempt",
    queueWaitMs,
    insertRpcMs,
    markCount,
    resultCount,
    dingCreditCount,
  });

  const finalizeStarted = nowFinalizeMs();
  const skipPerDrawDing = state.usesRoomLevelDing();
  const credited = await repo.finalizeEngineDrawJob({
    jobId,
    roomId,
    drawNumber: payload.number,
    marks: payload.persistence.marks,
    results: payload.persistence.results,
    setFirstLineDrawNumber: payload.persistence.setFirstLineDrawNumber,
    dingPerCard: skipPerDrawDing ? 0 : payload.ding.dingPerCard,
    dingCredits: skipPerDrawDing ? [] : payload.ding.credits,
    queueWaitMs,
    processingMs: 0,
    drainStartedAt: payload.drawnAtIso,
    firstPickedAt: payload.drawnAtIso,
    handlerStartedAt,
    actorEvaluateStartedAt: payload.drawnAtIso,
    actorFinalizeStartedAt,
    ownerId: actor.leaseFence.ownerId,
    leaseEpoch: actor.leaseFence.leaseEpoch,
    deferDing: actor.config.dingAsyncEnabled && !skipPerDrawDing,
  });
  const finalizeRpcMs = elapsedFinalizeMs(finalizeStarted);

  if (credited === -1) {
    logDrawFinalize(log, {
      owner: "ram-clock-persist",
      roomId,
      drawNumber: payload.number,
      jobId,
      outcome: "fenced",
      queueWaitMs,
      insertRpcMs,
      finalizeRpcMs,
      markCount,
      resultCount,
      dingCreditCount,
    });
    log.warn("[Room] persist finalize fenced — stale lease", {
      roomId,
      drawNumber: payload.number,
      jobId,
    });
    stateManager.evict(roomId);
    return "fenced";
  }

  logDrawFinalize(log, {
    owner: "ram-clock-persist",
    roomId,
    drawNumber: payload.number,
    jobId,
    outcome: "done",
    queueWaitMs,
    insertRpcMs,
    finalizeRpcMs,
    markCount,
    resultCount,
    dingCreditCount,
    dingUsersCredited: credited,
  });

  if (credited > 0) {
    log.info("ding aggregated (persist recorder)", {
      roomId,
      drawNumber: payload.number,
      jobId,
      users: credited,
    });
  }

  state.recordDrawProcessed(payload.number);

  if (payload.fullWinnerThisDraw) {
    try {
      const settled = await settleRoomIfNeeded(supabase, repo, roomId, {
        fullWinnerThisDraw: true,
      }, { state });
      if (settled) {
        stateManager.evict(roomId);
        log.info("room settled (full winner, persist recorder)", {
          roomId,
          drawNumber: payload.number,
        });
      }
    } catch (settleErr) {
      log.error("room settlement failed after persist finalize", {
        roomId,
        drawNumber: payload.number,
        error:
          settleErr instanceof Error ? settleErr.message : String(settleErr),
      });
    }
  }

  return "done";
}

/** Recovery path for DB rows inserted before finalize (no Clock payload). */
export async function recoverUnprocessedDrawFromDb(
  actor: RoomGameActor,
  drawNumber: number,
  createdAtIso: string
): Promise<EngineJobOutcome> {
  const { processEngineDrawJob } = await import("../draw/processEngineDrawJob.js");
  const jobId =
    (await actor.repo.getDrawJobId(actor.roomId, drawNumber)) ?? -1;
  return processEngineDrawJob(
    actor.supabase,
    actor.log,
    actor.repo,
    actor.stateManager,
    {
      id: jobId,
      room_id: actor.roomId,
      draw_number: drawNumber,
      status: "processing",
      attempts: 0,
      created_at: createdAtIso,
      updated_at: createdAtIso,
    },
    {
      maxAttempts: actor.config.drawProcessorMaxAttempts,
      cardRegistry: actor.cardRegistry,
      pickContext: {
        firstPickedAt: createdAtIso,
        pickStartTime: createdAtIso,
        pickEndTime: createdAtIso,
        pickMsPerJob: 0,
        drainStartedAt: createdAtIso,
      },
      actorTiming: true,
      leaseFence: actor.leaseFence,
      ramClockRecovery: true,
      deferDing: actor.config.dingAsyncEnabled,
    }
  );
}
