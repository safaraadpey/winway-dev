import type { EngineRole } from "../config/env.js";

const GLOBAL_LOCK_ROLES: EngineRole[] = [
  "scheduler",
  "draw-processor",
  "tournament-orchestrator",
  "dev-player-scheduler",
  "dev-player-processor",
];

export function roleRequiresRedisLock(role: EngineRole): boolean {
  return GLOBAL_LOCK_ROLES.includes(role);
}

export function shouldFailClosedWithoutRedis(args: {
  coordinationStrict: boolean;
  engineReplicaCount: number;
}): boolean {
  return args.coordinationStrict || args.engineReplicaCount > 1;
}
