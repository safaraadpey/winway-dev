/**
 * Instant game-room shell: localStorage cache + lobby cache + URL hints.
 * Live fields (canCancel, countdown, active cards/tables) hydrate from gameroom snapshot.
 */

import { readLobbyShellCache } from "@/lib/lobby/lobbyShell";
import type { RoomInfo } from "@/services/rooms";

const GAME_ROOM_SHELL_STORAGE_KEY = "winway.gameroom.shell.v1";
const DEFAULT_MAX_PLAYERS = 10;

export type GameRoomShellParams = {
  roomId?: string;
  templateId?: string;
  priceHint?: number;
  roomNameHint?: string;
};

export type GameRoomShellSource = "cache" | "lobby" | "hint" | "fallback";

export type GameRoomShellResult = {
  roomInfo: RoomInfo;
  source: GameRoomShellSource;
};

function shellCacheKey(params: {
  roomId?: string;
  templateId?: string;
}): string | null {
  if (params.templateId) return `tpl_${params.templateId}`;
  if (params.roomId) return `room_${params.roomId}`;
  return null;
}

function isValidRoomInfo(value: unknown): value is RoomInfo {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.roomCode === "string" &&
    typeof row.status === "string" &&
    typeof row.cardPrice === "number" &&
    Number.isFinite(row.cardPrice) &&
    typeof row.currency === "string" &&
    typeof row.currentPlayers === "number"
  );
}

function readAllGameRoomShellEntries(): Record<string, RoomInfo> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(GAME_ROOM_SHELL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { entries?: Record<string, unknown> };
    if (!parsed.entries || typeof parsed.entries !== "object") return {};
    const entries: Record<string, RoomInfo> = {};
    for (const [key, value] of Object.entries(parsed.entries)) {
      if (isValidRoomInfo(value)) {
        entries[key] = value;
      }
    }
    return entries;
  } catch {
    return {};
  }
}

export function readGameRoomShellCache(key: string): RoomInfo | null {
  return readAllGameRoomShellEntries()[key] ?? null;
}

export function writeGameRoomShellCache(
  key: string,
  roomInfo: RoomInfo,
  relatedKeys: string[] = []
): void {
  if (typeof window === "undefined") return;
  try {
    const entries = readAllGameRoomShellEntries();
    entries[key] = roomInfo;
    for (const relatedKey of relatedKeys) {
      if (relatedKey && relatedKey !== key) {
        entries[relatedKey] = roomInfo;
      }
    }
    localStorage.setItem(
      GAME_ROOM_SHELL_STORAGE_KEY,
      JSON.stringify({ entries, savedAt: Date.now() })
    );
  } catch (err) {
    console.warn("[Room] Failed to persist game-room shell cache", err);
  }
}

function lookupLobbyShell(params: GameRoomShellParams): {
  price: number;
  currency: string;
  roomName: string | null;
  templateId: string | null;
} | null {
  const groups = readLobbyShellCache();
  if (!groups?.length) return null;

  if (params.templateId) {
    const match = groups.find((g) => g.templateId === params.templateId);
    if (match) {
      return {
        price: match.price,
        currency: match.currency,
        roomName: match.roomName?.trim() || null,
        templateId: match.templateId ?? null,
      };
    }
  }

  if (params.roomId) {
    const match = groups.find((g) => g.entryRoomId === params.roomId);
    if (match) {
      return {
        price: match.price,
        currency: match.currency,
        roomName: match.roomName?.trim() || null,
        templateId: match.templateId ?? null,
      };
    }
  }

  return null;
}

function buildFallbackRoomInfo(
  params: GameRoomShellParams,
  overrides: Partial<RoomInfo> = {}
): RoomInfo {
  const id = params.roomId || params.templateId || "";
  const cardPrice =
    overrides.cardPrice ??
    (params.priceHint != null && params.priceHint > 0 ? params.priceHint : 0);

  return {
    id,
    roomCode: "",
    roomType: "normal",
    title: overrides.title ?? params.roomNameHint?.trim() ?? undefined,
    status: "waiting",
    cardPrice,
    currency: overrides.currency ?? "IRR",
    currentPlayers: 0,
    minPlayers: undefined,
    maxPlayers: overrides.maxPlayers ?? DEFAULT_MAX_PLAYERS,
    templateId: overrides.templateId ?? params.templateId,
    canCancel: false,
    requiresPassword: false,
    ...overrides,
  };
}

export function buildGameRoomShell(
  params: GameRoomShellParams
): GameRoomShellResult {
  const key = shellCacheKey(params);
  if (key) {
    const cached = readGameRoomShellCache(key);
    if (cached) {
      const roomInfo: RoomInfo = {
        ...cached,
        id: params.roomId || cached.id,
        templateId: params.templateId || cached.templateId,
      };
      console.info("[Room] Shell source: cache", {
        key,
        roomId: params.roomId,
        templateId: params.templateId,
      });
      return { roomInfo, source: "cache" };
    }
  }

  const lobbyMatch = lookupLobbyShell(params);
  if (lobbyMatch) {
    const roomInfo = buildFallbackRoomInfo(params, {
      cardPrice: lobbyMatch.price,
      currency: lobbyMatch.currency,
      title: lobbyMatch.roomName ?? params.roomNameHint?.trim() ?? undefined,
      templateId: lobbyMatch.templateId ?? params.templateId,
    });
    console.info("[Room] Shell source: lobby", {
      roomId: params.roomId,
      templateId: params.templateId,
      price: lobbyMatch.price,
    });
    return { roomInfo, source: "lobby" };
  }

  if (
    (params.priceHint != null && params.priceHint > 0) ||
    params.roomNameHint?.trim()
  ) {
    const roomInfo = buildFallbackRoomInfo(params, {
      cardPrice:
        params.priceHint != null && params.priceHint > 0
          ? params.priceHint
          : 0,
      title: params.roomNameHint?.trim() ?? undefined,
    });
    console.info("[Room] Shell source: hint", {
      roomId: params.roomId,
      templateId: params.templateId,
      price: roomInfo.cardPrice,
    });
    return { roomInfo, source: "hint" };
  }

  const roomInfo = buildFallbackRoomInfo(params);
  console.info("[Room] Shell source: fallback", {
    roomId: params.roomId,
    templateId: params.templateId,
  });
  return { roomInfo, source: "fallback" };
}

export function persistGameRoomShellFromSnapshot(
  roomInfo: RoomInfo,
  params: { roomId?: string; templateId?: string }
): void {
  const keys = new Set<string>();
  const primary = shellCacheKey(params);
  if (primary) keys.add(primary);
  if (roomInfo.templateId) keys.add(`tpl_${roomInfo.templateId}`);
  if (params.roomId) keys.add(`room_${params.roomId}`);
  if (roomInfo.id && roomInfo.id !== params.roomId && roomInfo.id !== params.templateId) {
    keys.add(`room_${roomInfo.id}`);
  }

  const keyList = Array.from(keys);
  if (keyList.length === 0) return;
  writeGameRoomShellCache(keyList[0], roomInfo, keyList.slice(1));
}

export function mergeShellForRoomIdTransition(
  prev: RoomInfo,
  roomId: string,
  templateId?: string
): RoomInfo {
  return {
    ...prev,
    id: roomId,
    templateId: templateId || prev.templateId,
  };
}

export function gameRoomSessionKey(params: {
  roomId?: string;
  templateId?: string;
}): string {
  if (params.roomId) return `room:${params.roomId}`;
  if (params.templateId) return `tpl:${params.templateId}`;
  return "unknown";
}
