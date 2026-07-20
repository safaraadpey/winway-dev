export type RedisBackend = "ioredis" | "upstash-rest";

export interface GameRedis {
  backend: RedisBackend;
  ping: () => Promise<boolean>;
  tryAcquireLock: (
    key: string,
    token: string,
    ttlSeconds: number
  ) => Promise<boolean>;
  /** Compare token then extend TTL (returns false if token mismatch). */
  renewLock: (key: string, token: string, ttlSeconds: number) => Promise<boolean>;
  releaseLock: (key: string, token: string) => Promise<void>;
  setJsonEx: (key: string, json: string, ttlSeconds: number) => Promise<void>;
  deleteKey: (key: string) => Promise<void>;
  evalScript: (
    script: string,
    keys: string[],
    args: string[]
  ) => Promise<unknown>;
  close: () => Promise<void>;
}
