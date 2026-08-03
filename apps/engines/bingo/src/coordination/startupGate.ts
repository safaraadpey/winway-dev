import type { EngineConfig } from "../config/env.js";
import type { Logger } from "../metrics/logger.js";
import type { GameRedis } from "../redis/types.js";

const GAME_CRON_JOB_NAMES = [
  "bingo_heartbeat",
  "bingo_draw_worker_1",
  "bingo_draw_worker_2",
  "bingo_draw_worker_3",
];

/**
 * Logs deploy-gate checklist at startup. Does not block boot (operators enforce gate).
 */
export function logStartupDeployGate(args: {
  config: EngineConfig;
  redis: GameRedis | null;
  log: Logger;
}): void {
  const { config, redis, log } = args;
  const roles = [...config.roles];
  const needsRoomLoop =
    config.schedulerEnabled &&
    config.runtime === "engine" &&
    roles.includes("room-loop");

  if (needsRoomLoop && !roles.includes("scheduler")) {
    log.warn("[Coordination] room-loop without scheduler — waiting rooms may not promote", {
      roles,
    });
  }

  if (config.coordinationStrict && !redis) {
    log.error("[Coordination] COORDINATION_STRICT=true but Redis unavailable — global workers unsafe for multi-replica", {
      hint: "Configure REDIS_URL before scaling replicas",
    });
  }

  if (config.engineReplicaCount > 1) {
    if (!redis) {
      log.error("[Coordination] ENGINE_REPLICA_COUNT>1 without Redis", {
        engineReplicaCount: config.engineReplicaCount,
      });
    } else if (!config.coordinationStrict) {
      log.warn("[Coordination] multiple replicas configured but COORDINATION_STRICT=false", {
        engineReplicaCount: config.engineReplicaCount,
        hint: "Set COORDINATION_STRICT=true on Railway before scale-out",
      });
    }
  }

  if (config.schedulerEnabled && config.runtime !== "legacy_db") {
    log.info("[Coordination] engine drives game loops — verify pg_cron game jobs disabled", {
      watchForCronNames: GAME_CRON_JOB_NAMES,
      doc: "docs/runbooks/horizontal-scaling-deploy-gate.md",
    });
  }

  log.info("[Coordination] startup gate snapshot", {
    runtime: config.runtime,
    schedulerEnabled: config.schedulerEnabled,
    roles,
    redis: redis ? "enabled" : "disabled",
    coordinationStrict: config.coordinationStrict,
    engineReplicaCount: config.engineReplicaCount,
  });
}
