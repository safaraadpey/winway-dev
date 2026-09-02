import type { RoomTemplateSnapshot, TemplateLimitSnapshot } from "./types.js";

export function isTemplateJoinable(
  template: RoomTemplateSnapshot,
  preset: { excludeVip: boolean; excludeTournament: boolean }
): boolean {
  if (!["active", "draining"].includes(template.status)) return false;
  if (preset.excludeTournament && template.roomType === "tournament") return false;
  if (preset.excludeVip && template.vip) return false;
  return true;
}

export function isPriceInPlayerRange(
  price: number,
  minRoomPrice: number | null,
  maxRoomPrice: number | null
): boolean {
  if (minRoomPrice !== null && price < minRoomPrice) return false;
  if (maxRoomPrice !== null && price > maxRoomPrice) return false;
  return true;
}

export function passesActiveRoomGate(
  activeRoomCount: number,
  limit: TemplateLimitSnapshot
): boolean {
  if (limit.minActiveRooms !== null && activeRoomCount < limit.minActiveRooms) {
    return false;
  }
  if (limit.maxActiveRooms !== null && activeRoomCount >= limit.maxActiveRooms) {
    return false;
  }
  return true;
}

export function passesJoinIntervalGate(
  lastScheduleAt: string | null,
  joinIntervalSeconds: number,
  now: Date
): boolean {
  if (!lastScheduleAt) return true;
  const elapsedMs = now.getTime() - new Date(lastScheduleAt).getTime();
  return elapsedMs >= joinIntervalSeconds * 1000;
}

/** Require enough normal (non-dev) players in the join-target waiting room. */
export function passesNormalPlayersPerRoomGate(
  normalPlayerCount: number,
  minNormalPlayersPerRoom: number | null
): boolean {
  if (minNormalPlayersPerRoom === null || minNormalPlayersPerRoom <= 0) {
    return true;
  }
  return normalPlayerCount >= minNormalPlayersPerRoom;
}

export const MIN_MAX_DEV_PLAYERS_PER_ROOM = 0;
export const MAX_MAX_DEV_PLAYERS_PER_ROOM = 99;

/** Null / empty = unlimited. Integer 0..99 otherwise. */
export function normalizeMaxDevPlayersPerRoom(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isInteger(num)) return null;
  if (num < MIN_MAX_DEV_PLAYERS_PER_ROOM) return MIN_MAX_DEV_PLAYERS_PER_ROOM;
  if (num > MAX_MAX_DEV_PLAYERS_PER_ROOM) return MAX_MAX_DEV_PLAYERS_PER_ROOM;
  return num;
}

/** Cap dev players in the join-target waiting room (oldest waiting, or new room => 0). */
export function passesDevPlayerMaxPerRoomGate(
  devPlayerCount: number,
  maxDevPlayersPerRoom: number | null
): boolean {
  const cap = normalizeMaxDevPlayersPerRoom(maxDevPlayersPerRoom);
  if (cap === null) return true;
  return devPlayerCount < cap;
}
