/** Key prefix for all game-engine Redis keys (Upstash). */
export const REDIS_PREFIX = "ding:game-engine";

export const redisKeys = {
  /** Distributed lock: only one scheduler leader per tick */
  schedulerLeader: () => `${REDIS_PREFIX}:lock:scheduler`,

  /** Distributed lock: draw processor batch */
  drawProcessorLeader: () => `${REDIS_PREFIX}:lock:draw-processor`,

  /** Distributed lock: tournament tick */
  tournamentTickLeader: () => `${REDIS_PREFIX}:lock:tournament-tick`,

  /** Distributed lock: dev-player scheduler tick */
  devPlayerSchedulerLeader: () => `${REDIS_PREFIX}:lock:dev-player-scheduler`,

  /** Distributed lock: dev-player schedule processor */
  devPlayerProcessorLeader: () => `${REDIS_PREFIX}:lock:dev-player-processor`,

  /** Short TTL cache for lobby snapshot (optional, P1) */
  lobbySnapshot: () => `${REDIS_PREFIX}:cache:lobby-snapshot`,

  /** Per-room draw job dedupe (optional, P1+) */
  drawJobInflight: (roomId: string, drawNumber: number) =>
    `${REDIS_PREFIX}:draw:inflight:${roomId}:${drawNumber}`,

  /** Serializes draw-job processing for one room across engine replicas. */
  drawRoomProcessor: (roomId: string) =>
    `${REDIS_PREFIX}:lock:draw-room:${roomId}`,
} as const;
