import type { EngineConfig } from "../config/env.js";
import type { Logger } from "../metrics/logger.js";
import type { EngineIdentity } from "../runtime/engineIdentity.js";
import { redisKeysV2 } from "./keysV2.js";
import type { GameRedis } from "./types.js";

const ROUTE_PUBLISH_LUA = `
local cur = redis.call("GET", KEYS[1])
if cur then
  local ok, prev = pcall(cjson.decode, cur)
  if ok and prev.leaseEpoch and tonumber(prev.leaseEpoch) > tonumber(ARGV[2]) then
    return 0
  end
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[3])
return 1
`;

const ROUTE_REMOVE_LUA = `
local cur = redis.call("GET", KEYS[1])
if not cur then return 1 end
local ok, prev = pcall(cjson.decode, cur)
if ok and prev.engineId == ARGV[1] and tonumber(prev.leaseEpoch) == tonumber(ARGV[2]) then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export class EngineRegistry {
  readonly engineId: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private draining = false;

  constructor(
    private readonly redis: GameRedis,
    private readonly identity: EngineIdentity,
    private readonly config: EngineConfig,
    private readonly log: Logger,
    private readonly roles: string[]
  ) {
    this.engineId = identity.engineId;
  }

  start(): void {
    void this.beat();
    this.timer = setInterval(
      () => void this.beat(),
      this.config.engineHeartbeatIntervalMs
    );
  }

  setDraining(value: boolean): void {
    this.draining = value;
    void this.beat();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const key = redisKeysV2.engineHeartbeat(this.engineId);
    await this.redis.deleteKey(key).catch(() => undefined);
    this.log.info("[Coordination] heartbeat removed", { engineId: this.engineId });
  }

  async publishRoomRoute(args: {
    roomId: string;
    leaseEpoch: number;
    ttlSec: number;
  }): Promise<void> {
    const payload = JSON.stringify({
      engineId: this.engineId,
      leaseEpoch: args.leaseEpoch,
      hostname: this.identity.hostname,
    });
    const key = redisKeysV2.roomRoute(args.roomId);
    await this.redis.evalScript(ROUTE_PUBLISH_LUA, [key], [
      payload,
      String(args.leaseEpoch),
      String(Math.max(1, args.ttlSec)),
    ]);
  }

  async removeRoomRoute(roomId: string, leaseEpoch: number): Promise<void> {
    const key = redisKeysV2.roomRoute(roomId);
    await this.redis
      .evalScript(ROUTE_REMOVE_LUA, [key], [
        this.engineId,
        String(leaseEpoch),
      ])
      .catch(() => undefined);
  }

  private async beat(): Promise<void> {
    const key = redisKeysV2.engineHeartbeat(this.engineId);
    const payload = JSON.stringify({
      engineId: this.engineId,
      hostname: this.identity.hostname,
      startedAt: this.identity.startedAtIso,
      roles: this.roles,
      draining: this.draining,
    });
    try {
      await this.redis.setJsonEx(
        key,
        payload,
        this.config.engineHeartbeatTtlSec
      );
    } catch (err) {
      this.log.warn("[Coordination] heartbeat failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function createEngineRegistry(args: {
  redis: GameRedis | null;
  identity: EngineIdentity;
  config: EngineConfig;
  log: Logger;
  roles: string[];
}): EngineRegistry | null {
  if (!args.redis) return null;
  return new EngineRegistry(
    args.redis,
    args.identity,
    args.config,
    args.log,
    args.roles
  );
}
