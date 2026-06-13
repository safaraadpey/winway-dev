import { getGlobalCardRegistry } from "../../core/card-registry/index.js";
import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import { reapStaleDrawJobs } from "../../domain/draw/reapStaleJobs.js";
import { GameRepo } from "../../repositories/index.js";
import {
  registerDrawProcessorWake,
  type DrawProcessorWakeReason,
} from "../../runtime/draw-processor-wake.js";
import { executesBusinessLogic } from "../../runtime.js";
import type { WorkerContext } from "../context.js";
import { createPickCoordinator } from "./pickCoordinator.js";
import { RoomDrawActorPool } from "./roomDrawActorPool.js";
import { startDrawJobWakeListener } from "./wakeListener.js";

/**
 * Phase 2: pick coordinator + per-room serial actors.
 * Pick is decoupled from room processing — no global inFlight drain mutex.
 */
export function startPerRoomActorProcessor(ctx: WorkerContext): () => void {
  const { supabase, config, log, redis } = ctx;
  const repo = new GameRepo(supabase);
  let stopped = false;
  let lastReapMs = 0;
  let cardRegistry: GlobalCardRegistry | null = null;

  const ensureCardRegistry = async (): Promise<GlobalCardRegistry | null> => {
    if (!executesBusinessLogic(config.runtime)) return null;
    if (!cardRegistry) {
      cardRegistry = await getGlobalCardRegistry(repo, log);
    }
    return cardRegistry;
  };

  const coordinatorRef: {
    schedulePick: (reason: DrawProcessorWakeReason) => void;
  } = { schedulePick: () => undefined };

  const pool = new RoomDrawActorPool({
    supabase,
    log,
    repo,
    stateManager: ctx.roomState,
    maxAttempts: config.drawProcessorMaxAttempts,
    getCardRegistry: () => cardRegistry,
    redis,
    drawRoomLockTtlSec: config.drawRoomLockTtlSec,
    onWorkRequeued: () => coordinatorRef.schedulePick("backlog"),
  });

  const coordinator = createPickCoordinator({
    supabase,
    log,
    redis,
    pool,
    repo,
    roomLoopMode: config.roomLoopMode,
    lockTtlSec: config.drawProcessorLockTtlSec,
    batchSize: config.drawProcessorBatchSize,
    maxRoundsPerPoll: config.drawProcessorMaxBatchesPerTick,
    maxRoundsPerWake: config.drawProcessorMaxBatchesPerWake,
  });

  coordinatorRef.schedulePick = coordinator.schedulePick;

  const maybeReapStaleJobs = async (): Promise<void> => {
    if (!executesBusinessLogic(config.runtime)) return;
    const now = Date.now();
    if (now - lastReapMs < config.drawJobReapIntervalMs) return;
    lastReapMs = now;
    await reapStaleDrawJobs({
      repo,
      log,
      staleSec: config.drawJobStaleSec,
      roomState: ctx.roomState,
    });
  };

  const requestPick = (reason: DrawProcessorWakeReason): void => {
    if (stopped) return;
    void maybeReapStaleJobs();
    void ensureCardRegistry().then(() => coordinator.schedulePick(reason));
  };

  const unregisterWake = registerDrawProcessorWake((reason) => {
    if (!config.drawProcessorWakeOnEnqueue) return;
    requestPick(reason);
  });

  const stopWakeListener =
    config.drawProcessorWakeOnEnqueue && executesBusinessLogic(config.runtime)
      ? startDrawJobWakeListener(supabase, log)
      : () => undefined;

  requestPick("poll");
  const timer = setInterval(
    () => requestPick("poll"),
    config.drawProcessorIntervalMs
  );

  return () => {
    stopped = true;
    clearInterval(timer);
    unregisterWake();
    stopWakeListener();
    coordinator.stop();
    pool.stop();
  };
}
