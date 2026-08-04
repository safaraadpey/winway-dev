/**
 * Redis client for crypto deposit engine (Upstash REST).
 * Falls back to in-process memory store when env is missing (local/dev).
 */
import { Redis } from "@upstash/redis";

/** Legacy alias — Hot Watch set (same key for backward compatibility). */
const ACTIVE_SET = "active_crypto_addresses";
const HOT_SET = ACTIVE_SET;
const WARM_SET = "crypto_watch:warm";
const CONFIRM_SET = "crypto_watch:confirm";
const PRICE_LOCK_PREFIX = "price_lock:";
const CHECK_COOLDOWN_PREFIX = "crypto_check_cd:";

export const CRYPTO_REDIS_KEYS = {
  /** @deprecated use HOT_SET */
  ACTIVE_SET,
  HOT_SET,
  WARM_SET,
  CONFIRM_SET,
  priceLock: (userId: string) => `${PRICE_LOCK_PREFIX}${userId}`,
  checkCooldown: (userId: string) => `${CHECK_COOLDOWN_PREFIX}${userId}`,
  /** @deprecated use hotMeta */
  activeMeta: (userId: string) => `active_crypto_meta:${userId}`,
  hotMeta: (userId: string) => `active_crypto_meta:${userId}`,
  warmMeta: (userId: string) => `crypto_watch:warm_meta:${userId}`,
  confirmMeta: (userId: string) => `crypto_watch:confirm_meta:${userId}`,
} as const;

export const CRYPTO_TTL = {
  /** Hot Watch: 1 hour sliding from last deposit activity */
  HOT_WATCH_SEC: 3600,
  /** @deprecated alias of HOT_WATCH_SEC */
  ACTIVE_ADDRESS_SEC: 3600,
  /** Safety TTL refreshed while PENDING remains */
  CONFIRM_WATCH_SEC: 86_400,
  PRICE_LOCK_SEC: 1200,
  CHECK_COOLDOWN_SEC: 60,
} as const;

type MemoryEntry = { value: string; expiresAt: number | null };

declare global {
  // eslint-disable-next-line no-var
  var __cryptoRedisMem: Map<string, MemoryEntry> | undefined;
  // eslint-disable-next-line no-var
  var __cryptoRedisSets: Map<string, Set<string>> | undefined;
}

function memStore(): Map<string, MemoryEntry> {
  if (!global.__cryptoRedisMem) global.__cryptoRedisMem = new Map();
  return global.__cryptoRedisMem;
}

function memSets(): Map<string, Set<string>> {
  if (!global.__cryptoRedisSets) global.__cryptoRedisSets = new Map();
  return global.__cryptoRedisSets;
}

function pruneMemKey(key: string): MemoryEntry | null {
  const store = memStore();
  const e = store.get(key);
  if (!e) return null;
  if (e.expiresAt != null && e.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return e;
}

function createUpstash(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

declare global {
  // eslint-disable-next-line no-var
  var __cryptoUpstash: Redis | null | undefined;
}

function getUpstash(): Redis | null {
  if (global.__cryptoUpstash === undefined) {
    global.__cryptoUpstash = createUpstash();
    if (global.__cryptoUpstash) {
      console.log("[Payment] Upstash Redis connected for crypto engine");
    } else {
      console.warn(
        "[Payment] Upstash Redis not configured — using in-memory fallback"
      );
    }
  }
  return global.__cryptoUpstash;
}

export type CryptoRedis = {
  backend: "upstash" | "memory";
  setJson: (key: string, value: unknown, ttlSec: number) => Promise<void>;
  getJson: <T>(key: string) => Promise<T | null>;
  del: (key: string) => Promise<void>;
  setNxEx: (key: string, value: string, ttlSec: number) => Promise<boolean>;
  sadd: (key: string, member: string) => Promise<void>;
  srem: (key: string, member: string) => Promise<void>;
  smembers: (key: string) => Promise<string[]>;
};

export function getCryptoRedis(): CryptoRedis {
  const upstash = getUpstash();

  if (upstash) {
    return {
      backend: "upstash",
      async setJson(key, value, ttlSec) {
        await upstash.set(key, JSON.stringify(value), { ex: ttlSec });
      },
      async getJson<T>(key: string) {
        const raw = await upstash.get<string | T>(key);
        if (raw == null) return null;
        if (typeof raw === "string") {
          try {
            return JSON.parse(raw) as T;
          } catch {
            return raw as T;
          }
        }
        return raw as T;
      },
      async del(key) {
        await upstash.del(key);
      },
      async setNxEx(key, value, ttlSec) {
        const res = await upstash.set(key, value, { nx: true, ex: ttlSec });
        return res === "OK";
      },
      async sadd(key, member) {
        await upstash.sadd(key, member);
      },
      async srem(key, member) {
        await upstash.srem(key, member);
      },
      async smembers(key) {
        const members = await upstash.smembers(key);
        return (members as string[]) ?? [];
      },
    };
  }

  return {
    backend: "memory",
    async setJson(key, value, ttlSec) {
      memStore().set(key, {
        value: JSON.stringify(value),
        expiresAt: Date.now() + ttlSec * 1000,
      });
    },
    async getJson<T>(key: string) {
      const e = pruneMemKey(key);
      if (!e) return null;
      try {
        return JSON.parse(e.value) as T;
      } catch {
        return null;
      }
    },
    async del(key) {
      memStore().delete(key);
      memSets().get(key)?.clear();
      memSets().delete(key);
    },
    async setNxEx(key, value, ttlSec) {
      if (pruneMemKey(key)) return false;
      memStore().set(key, {
        value,
        expiresAt: Date.now() + ttlSec * 1000,
      });
      return true;
    },
    async sadd(key, member) {
      const sets = memSets();
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key)!.add(member);
    },
    async srem(key, member) {
      memSets().get(key)?.delete(member);
    },
    async smembers(key) {
      return Array.from(memSets().get(key) ?? []);
    },
  };
}
