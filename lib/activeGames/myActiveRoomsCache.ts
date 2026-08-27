/**
 * Per-user in-memory cache for GET /api/player/my-active-rooms.
 * Enables 304 responses without hitting Postgres when the client ETag matches.
 *
 * Note: single Node process scope (dev / long-lived server). Entries expire
 * after CACHE_MAX_AGE_MS so a missed realtime invalidation cannot 304 forever.
 *
 * Clients that call invalidate("manual") omit If-None-Match so this cache
 * cannot hide a fresh post-join snapshot behind a stale 304.
 */

export type CachedActiveRoom = {
  roomId: string;
  roomCode: string | null;
  status: "waiting" | "playing" | "live" | "settling";
  cardPrice: number;
  currency: string;
  cardCount: number;
  prize: number;
  roomType: string;
  templateId: string | null;
  templateTableIndex: number;
  roundNo: number | null;
};

type CacheEntry = {
  etag: string;
  rooms: CachedActiveRoom[];
  updatedAt: number;
};

const CACHE = new Map<string, CacheEntry>();

/** Max age before we revalidate against DB even if ETag matches. */
export const CACHE_MAX_AGE_MS = 15_000;

const MAX_ENTRIES = 5_000;

function pruneIfNeeded(): void {
  if (CACHE.size <= MAX_ENTRIES) return;
  const oldest = [...CACHE.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  const removeCount = Math.ceil(MAX_ENTRIES * 0.1);
  for (let i = 0; i < removeCount; i++) {
    CACHE.delete(oldest[i]![0]);
  }
}

export function getCachedActiveRooms(userId: string): CacheEntry | undefined {
  const entry = CACHE.get(userId);
  if (!entry) return undefined;
  if (Date.now() - entry.updatedAt > CACHE_MAX_AGE_MS) {
    CACHE.delete(userId);
    return undefined;
  }
  return entry;
}

export function invalidateCachedActiveRooms(userId: string): void {
  CACHE.delete(userId);
}

export function setCachedActiveRooms(
  userId: string,
  etag: string,
  rooms: CachedActiveRoom[]
): void {
  pruneIfNeeded();
  CACHE.set(userId, { etag, rooms, updatedAt: Date.now() });
}
