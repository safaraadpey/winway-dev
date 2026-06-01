export type RedisBackend = "ioredis" | "upstash-rest";

export interface GameRedis {
  backend: RedisBackend;
  ping: () => Promise<boolean>;
  tryAcquireLock: (
    key: string,
    token: string,
    ttlSeconds: number
  ) => Promise<boolean>;
  releaseLock: (key: string, token: string) => Promise<void>;
  close: () => Promise<void>;
}
