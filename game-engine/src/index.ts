/**
 * Game Engine entrypoint.
 * Phase 0: scaffold only — workers log and exit loops until implemented.
 * See docs/roadmap/GAME_ENGINE_MIGRATION.md
 */

import "dotenv/config";

import { loadConfig, type EngineRole } from "./config/env.js";
import { createSupabaseAdmin } from "./db/supabase-admin.js";
import { startHealthServer } from "./health/server.js";
import { startApiServer } from "./http/server.js";
import { createLogger } from "./metrics/logger.js";
import {
  connectRedis,
  createRedisConnection,
  type RedisHandle,
} from "./redis/client.js";
import { reapStaleDrawJobs } from "./domain/draw/reapStaleJobs.js";
import { executesBusinessLogic } from "./runtime.js";
import { getGlobalCardRegistry } from "./core/card-registry/index.js";
import { GameRepo } from "./repositories/index.js";
import { RoomStateManager } from "./state/index.js";
import { startDrawProcessor } from "./workers/draw-processor/index.js";
import { startRoomLoop } from "./workers/room-loop/index.js";
import { startRoomScheduler } from "./workers/room-scheduler/index.js";
import { startTournamentOrchestrator } from "./workers/tournament-orchestrator/index.js";
import { startDevPlayerProcessor } from "./workers/dev-player/processor.js";
import { startDevPlayerScheduler } from "./workers/dev-player/scheduler.js";

/** Roles driven by periodic ticks — gated by SCHEDULER_ENABLED. */
const SCHEDULED_ROLES = new Set<EngineRole>([
  "scheduler",
  "draw-processor",
  "room-loop",
  "tournament-orchestrator",
  "dev-player-scheduler",
  "dev-player-processor",
]);

function startScheduledWorkers(
  config: ReturnType<typeof loadConfig>,
  workerCtx: Parameters<typeof startRoomScheduler>[0],
  stops: Array<() => void>
): void {
  if (!config.schedulerEnabled) {
    const skipped = [...config.roles].filter((role) => SCHEDULED_ROLES.has(role));
    console.log("Scheduler disabled");
    if (skipped.length > 0) {
      workerCtx.log.info("Scheduler disabled; skipping scheduled roles", {
        roles: skipped,
      });
    }
    return;
  }

  console.log("Scheduler started");
  workerCtx.log.info("Scheduler started");

  if (config.roles.has("scheduler")) {
    stops.push(startRoomScheduler(workerCtx));
  }
  if (config.roles.has("draw-processor")) {
    stops.push(startDrawProcessor(workerCtx));
  }
  if (config.roles.has("room-loop")) {
    stops.push(startRoomLoop(workerCtx));
  }
  if (config.roles.has("tournament-orchestrator")) {
    stops.push(startTournamentOrchestrator(workerCtx));
  }
  if (config.roles.has("dev-player-scheduler")) {
    stops.push(startDevPlayerScheduler(workerCtx));
  }
  if (config.roles.has("dev-player-processor")) {
    stops.push(startDevPlayerProcessor(workerCtx));
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.logLevel);
  const supabase = createSupabaseAdmin(config);

  let redisHandle: RedisHandle | null = createRedisConnection(config, log);
  let redis = redisHandle?.redis ?? null;
  if (redisHandle) {
    const redisReady = await connectRedis(redisHandle, log);
    if (!redisReady) {
      await redisHandle.redis.close().catch(() => undefined);
      redisHandle = null;
      redis = null;
    }
  }

  log.info("game-engine starting", {
    roles: [...config.roles],
    runtime: config.runtime,
    redis: redis ? "enabled" : "disabled",
    schedulerEnabled: config.schedulerEnabled,
  });

  if (config.httpPort > 0) {
    const pingRedis = redis ? () => redis!.ping() : undefined;
    if (config.apiEnabled) {
      startApiServer(config.httpPort, { supabase, log, pingRedis });
    } else {
      startHealthServer(config.httpPort, log, { pingRedis });
    }
  }

  const stops: Array<() => void> = [];

  const repo = new GameRepo(supabase);
  const roomState = new RoomStateManager(repo, log, config.roomStateCheckpointEvery);
  if (config.schedulerEnabled && executesBusinessLogic(config.runtime)) {
    await getGlobalCardRegistry(repo, log);
  }
  if (config.schedulerEnabled && executesBusinessLogic(config.runtime)) {
    await reapStaleDrawJobs({
      repo,
      log,
      staleSec: config.drawJobStaleSec,
      roomState,
    });
  }
  const workerCtx = { supabase, config, log, redis, roomState };

  startScheduledWorkers(config, workerCtx, stops);

  if (stops.length === 0) {
    if (config.schedulerEnabled) {
      log.warn("no GAME_ENGINE_ROLES enabled; nothing to run");
    } else if ([...config.roles].some((role) => SCHEDULED_ROLES.has(role))) {
      log.info("game-engine running without scheduled workers (API/health only)");
    } else {
      log.warn("no GAME_ENGINE_ROLES enabled; nothing to run");
    }
  }

  const shutdown = (): void => {
    log.info("shutdown signal received");
    for (const stop of stops) stop();
    void (async () => {
      if (redis) await redis.close();
      process.exit(0);
    })();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[game-engine] fatal", err);
  process.exit(1);
});
