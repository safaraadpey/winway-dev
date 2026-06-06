/**
 * Game Engine entrypoint.
 * Phase 0: scaffold only — workers log and exit loops until implemented.
 * See docs/roadmap/GAME_ENGINE_MIGRATION.md
 */

import "dotenv/config";

import { loadConfig } from "./config/env.js";
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
import { GameRepo } from "./repositories/index.js";
import { RoomStateManager } from "./state/index.js";
import { startDrawProcessor } from "./workers/draw-processor/index.js";
import { startRoomScheduler } from "./workers/room-scheduler/index.js";
import { startTournamentOrchestrator } from "./workers/tournament-orchestrator/index.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.logLevel);
  const supabase = createSupabaseAdmin(config);

  let redisHandle: RedisHandle | null = createRedisConnection(config, log);
  let redis = redisHandle?.redis ?? null;
  if (redisHandle) {
    await connectRedis(redisHandle, log);
  }

  log.info("game-engine starting", {
    roles: [...config.roles],
    runtime: config.runtime,
    redis: redis ? "enabled" : "disabled",
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
  if (executesBusinessLogic(config.runtime)) {
    await reapStaleDrawJobs({
      repo,
      log,
      staleSec: config.drawJobStaleSec,
      roomState,
    });
  }
  const workerCtx = { supabase, config, log, redis, roomState };

  if (config.roles.has("scheduler")) {
    stops.push(startRoomScheduler(workerCtx));
  }
  if (config.roles.has("draw-processor")) {
    stops.push(startDrawProcessor(workerCtx));
  }
  if (config.roles.has("tournament-orchestrator")) {
    stops.push(startTournamentOrchestrator(workerCtx));
  }

  if (stops.length === 0) {
    log.warn("no GAME_ENGINE_ROLES enabled; nothing to run");
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
