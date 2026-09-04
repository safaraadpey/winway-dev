/** Key prefix for coordination keys (v2). */
export const REDIS_PREFIX_V2 = "ding:game-engine:v2";

export const redisKeysV2 = {
  engineHeartbeat: (engineId: string) =>
    `${REDIS_PREFIX_V2}:engine:${engineId}`,
  roomRoute: (roomId: string) => `${REDIS_PREFIX_V2}:room:${roomId}:route`,
  lockWorkerScheduler: () => `${REDIS_PREFIX_V2}:lock:worker:scheduler`,
  lockWorkerDrawPicker: () => `${REDIS_PREFIX_V2}:lock:worker:draw-picker`,
  lockWorkerTournament: () => `${REDIS_PREFIX_V2}:lock:worker:tournament`,
  lockWorkerDevPlayerScheduler: () =>
    `${REDIS_PREFIX_V2}:lock:worker:dev-player-scheduler`,
  lockWorkerDevPlayerProcessor: () =>
    `${REDIS_PREFIX_V2}:lock:worker:dev-player-processor`,
  lockWorkerDingProcessor: () =>
    `${REDIS_PREFIX_V2}:lock:worker:ding-processor`,
} as const;
