import { Redis as UpstashRedis } from "@upstash/redis";
import { Redis as IoRedis } from "ioredis";
import type { EngineConfig } from "../config/env.js";
import type { Logger } from "../metrics/logger.js";
import type { GameRedis } from "./types.js";

export type { GameRedis } from "./types.js";

export interface RedisHandle {
  redis: GameRedis;
  connect: () => Promise<void>;
}

function createIoRedis(config: EngineConfig, log: Logger): RedisHandle {
  const client = new IoRedis(config.redisUrl!, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    tls: config.redisUrl!.startsWith("rediss://") ? {} : undefined,
  });

  client.on("error", (err: Error) => {
    log.error("redis error", { message: err.message, backend: "ioredis" });
  });

  client.on("connect", () => {
    log.info("redis connected", { backend: "ioredis" });
  });

  const redis: GameRedis = {
    backend: "ioredis",
    async ping() {
      try {
        return (await client.ping()) === "PONG";
      } catch {
        return false;
      }
    },
    async tryAcquireLock(key, token, ttlSeconds) {
      const result = await client.set(key, token, "EX", ttlSeconds, "NX");
      return result === "OK";
    },
    async releaseLock(key, token) {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await client.eval(script, 1, key, token);
    },
    async close() {
      await client.quit();
    },
  };

  return {
    redis,
    connect: async () => {
      await client.connect();
    },
  };
}

function createUpstashRest(config: EngineConfig, log: Logger): RedisHandle {
  const client = new UpstashRedis({
    url: config.upstashRestUrl!,
    token: config.upstashRestToken!,
  });

  log.info("redis client configured", { backend: "upstash-rest" });

  const redis: GameRedis = {
    backend: "upstash-rest",
    async ping() {
      try {
        return (await client.ping()) === "PONG";
      } catch {
        return false;
      }
    },
    async tryAcquireLock(key, token, ttlSeconds) {
      const result = await client.set(key, token, { nx: true, ex: ttlSeconds });
      return result === "OK";
    },
    async releaseLock(key, token) {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await client.eval(script, [key], [token]);
    },
    async close() {},
  };

  return { redis, connect: async () => {} };
}

export function createRedisConnection(
  config: EngineConfig,
  log: Logger
): RedisHandle | null {
  if (config.redisUrl) {
    return createIoRedis(config, log);
  }

  if (config.upstashRestUrl && config.upstashRestToken) {
    return createUpstashRest(config, log);
  }

  log.warn(
    "Redis not configured (set REDIS_URL or UPSTASH_REDIS_REST_*) — single-instance mode"
  );
  return null;
}

export async function connectRedis(
  handle: RedisHandle,
  log: Logger
): Promise<void> {
  await handle.connect();
  const ok = await handle.redis.ping();
  if (!ok) {
    throw new Error("Redis ping failed");
  }
  log.info("redis ready", { backend: handle.redis.backend });
}
