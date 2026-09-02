/**
 * Instant live-room shell: localStorage cache + gameroom/lobby cache.
 * Cards and draws hydrate from live-room snapshot in the background.
 */

import { readLobbyShellCache } from "@/lib/lobby/lobbyShell";
import { readGameRoomShellCache } from "@/lib/gameroom/gameRoomShell";
import type { LiveRoomSnapshot } from "@/services/rooms";

const LIVE_ROOM_SHELL_STORAGE_KEY = "winway.liveroom.shell.v1";

export type LiveRoomShellSource = "cache" | "gameroom" | "lobby" | "fallback";

export type LiveRoomShellResult = {
  snapshot: LiveRoomSnapshot;
  source: LiveRoomShellSource;
};

function liveRoomCacheKey(roomId: string): string {
  return `room_${roomId}`;
}

function isValidLiveRoomSnapshot(value: unknown): value is LiveRoomSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const room = row.room as Record<string, unknown> | undefined;
  if (!room || typeof room.id !== "string") return false;
  if (typeof room.card_price !== "number" || !Number.isFinite(room.card_price)) {
    return false;
  }
  if (!Array.isArray(row.draws) || !Array.isArray(row.cards)) return false;
  return true;
}

function readAllLiveRoomShellEntries(): Record<string, LiveRoomSnapshot> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LIVE_ROOM_SHELL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { entries?: Record<string, unknown> };
    if (!parsed.entries || typeof parsed.entries !== "object") return {};
    const entries: Record<string, LiveRoomSnapshot> = {};
    for (const [key, value] of Object.entries(parsed.entries)) {
      if (isValidLiveRoomSnapshot(value)) {
        entries[key] = value;
      }
    }
    return entries;
  } catch {
    return {};
  }
}

export function readLiveRoomShellCache(roomId: string): LiveRoomSnapshot | null {
  return readAllLiveRoomShellEntries()[liveRoomCacheKey(roomId)] ?? null;
}

export function persistLiveRoomShellCache(
  roomId: string,
  snapshot: LiveRoomSnapshot
): void {
  if (typeof window === "undefined") return;
  try {
    const entries = readAllLiveRoomShellEntries();
    entries[liveRoomCacheKey(roomId)] = snapshot;
    localStorage.setItem(
      LIVE_ROOM_SHELL_STORAGE_KEY,
      JSON.stringify({ entries, savedAt: Date.now() })
    );
  } catch (err) {
    console.warn("[LiveRoom] Failed to persist shell cache", err);
  }
}

function lookupPriceAndName(roomId: string): {
  cardPrice: number;
  currency: string;
  roomName: string | null;
  roomCode: string | null;
} {
  const gameRoomCached = readGameRoomShellCache(`room_${roomId}`);
  if (gameRoomCached && gameRoomCached.cardPrice > 0) {
    return {
      cardPrice: gameRoomCached.cardPrice,
      currency: gameRoomCached.currency || "IRR",
      roomName: gameRoomCached.title?.trim() || null,
      roomCode: gameRoomCached.roomCode || null,
    };
  }

  const lobbyGroups = readLobbyShellCache();
  const lobbyMatch = lobbyGroups?.find((g) => g.entryRoomId === roomId);
  if (lobbyMatch) {
    return {
      cardPrice: lobbyMatch.price,
      currency: lobbyMatch.currency || "IRR",
      roomName: lobbyMatch.roomName?.trim() || null,
      roomCode: null,
    };
  }

  return {
    cardPrice: 0,
    currency: "IRR",
    roomName: null,
    roomCode: null,
  };
}

function buildFallbackLiveRoomSnapshot(
  roomId: string,
  overrides: Partial<LiveRoomSnapshot["room"]> = {}
): LiveRoomSnapshot {
  const meta = lookupPriceAndName(roomId);
  const cardPrice = overrides.card_price ?? meta.cardPrice;
  const roomCode =
    overrides.room_code ??
    meta.roomCode ??
    (cardPrice > 0 ? String(cardPrice) : null);

  return {
    room: {
      id: roomId,
      status: overrides.status ?? "playing",
      room_code: roomCode,
      room_name: overrides.room_name ?? meta.roomName,
      room_seed_hash: overrides.room_seed_hash ?? null,
      card_price: cardPrice,
      currency: overrides.currency ?? meta.currency,
      min_players: overrides.min_players ?? null,
      max_cards_per_player: overrides.max_cards_per_player ?? null,
      started_at: overrides.started_at ?? null,
      next_draw_at: overrides.next_draw_at,
      line_reward_percentage: overrides.line_reward_percentage ?? 0.5,
      full_reward_percentage: overrides.full_reward_percentage ?? 0.5,
      commission_rate: overrides.commission_rate ?? 0,
      ding_per_number: overrides.ding_per_number,
      draw_interval_sec: overrides.draw_interval_sec,
    },
    tournament: null,
    draws: [],
    cards: [],
    card_pool: null,
  };
}

export function buildLiveRoomShell(roomId: string): LiveRoomShellResult {
  const cached = readLiveRoomShellCache(roomId);
  if (cached) {
    console.info("[LiveRoom] Shell source: cache", { roomId });
    return {
      snapshot: {
        ...cached,
        room: { ...cached.room, id: roomId },
        draws: cached.draws ?? [],
        cards: cached.cards ?? [],
      },
      source: "cache",
    };
  }

  const gameRoomCached = readGameRoomShellCache(`room_${roomId}`);
  if (gameRoomCached && gameRoomCached.cardPrice > 0) {
    const snapshot = buildFallbackLiveRoomSnapshot(roomId, {
      card_price: gameRoomCached.cardPrice,
      currency: gameRoomCached.currency || "IRR",
      room_name: gameRoomCached.title?.trim() || null,
      room_code: gameRoomCached.roomCode || null,
      status: gameRoomCached.status || "playing",
    });
    console.info("[LiveRoom] Shell source: gameroom", {
      roomId,
      cardPrice: gameRoomCached.cardPrice,
    });
    return { snapshot, source: "gameroom" };
  }

  const lobbyGroups = readLobbyShellCache();
  const lobbyMatch = lobbyGroups?.find((g) => g.entryRoomId === roomId);
  if (lobbyMatch) {
    const snapshot = buildFallbackLiveRoomSnapshot(roomId, {
      card_price: lobbyMatch.price,
      currency: lobbyMatch.currency || "IRR",
      room_name: lobbyMatch.roomName?.trim() || null,
    });
    console.info("[LiveRoom] Shell source: lobby", {
      roomId,
      cardPrice: lobbyMatch.price,
    });
    return { snapshot, source: "lobby" };
  }

  const snapshot = buildFallbackLiveRoomSnapshot(roomId);
  console.info("[LiveRoom] Shell source: fallback", { roomId });
  return { snapshot, source: "fallback" };
}
