import type { ActiveRoom } from "@/lib/hooks/useActiveGames";
import {
  ACTIVE_ROOM_STATUSES,
  ACTIVE_ROOM_STATUS_ORDER,
} from "@/lib/activeGames/constants";

export type ActiveRoomPatchAction =
  | "ignored"
  | "heartbeat"
  | "patch-fields"
  | "patch-status"
  | "remove"
  | "resync";

export type ActiveRoomPatchResult = {
  rooms: ActiveRoom[];
  action: ActiveRoomPatchAction;
  changed: boolean;
};

export function sortActiveRooms(rooms: ActiveRoom[]): ActiveRoom[] {
  return [...rooms].sort(
    (a, b) =>
      (ACTIVE_ROOM_STATUS_ORDER[a.status] ?? 9) -
      (ACTIVE_ROOM_STATUS_ORDER[b.status] ?? 9)
  );
}

export function syncRoomStatusMap(
  rooms: ActiveRoom[],
  roomStatusById: Map<string, string>
): void {
  roomStatusById.clear();
  for (const room of rooms) {
    if (room?.roomId && room?.status) {
      roomStatusById.set(room.roomId, room.status);
    }
  }
}

/**
 * Apply a rooms UPDATE realtime payload to the in-memory active-room list.
 * Returns resync when the room became active but is not yet in the list.
 */
export function patchActiveRoomsFromRoomUpdate(
  rooms: ActiveRoom[],
  roomStatusById: Map<string, string>,
  payload: { new?: Record<string, unknown> }
): ActiveRoomPatchResult {
  const row = payload.new;
  if (!row) {
    return { rooms, action: "ignored", changed: false };
  }

  const roomId = row.id as string | undefined;
  const newStatus = row.status as string | undefined;
  if (!roomId) {
    return { rooms, action: "ignored", changed: false };
  }

  const idx = rooms.findIndex((r) => r.roomId === roomId);
  const inList = idx >= 0;
  if (!roomStatusById.has(roomId) && !inList) {
    return { rooms, action: "ignored", changed: false };
  }

  const prevStatus = roomStatusById.get(roomId) ?? rooms[idx]?.status;

  if (newStatus && prevStatus === newStatus && inList) {
    const room = rooms[idx]!;
    const next: ActiveRoom = { ...room };
    let changed = false;

    if ("room_code" in row && row.room_code !== room.roomCode) {
      next.roomCode = (row.room_code as string | null) ?? null;
      changed = true;
    }
    if ("card_price" in row && Number(row.card_price ?? 0) !== room.cardPrice) {
      next.cardPrice = Number(row.card_price ?? 0);
      next.prize = next.cardPrice * room.cardCount;
      changed = true;
    }

    if (!changed) {
      return { rooms, action: "heartbeat", changed: false };
    }

    const nextRooms = [...rooms];
    nextRooms[idx] = next;
    const sorted = sortActiveRooms(nextRooms);
    syncRoomStatusMap(sorted, roomStatusById);
    return { rooms: sorted, action: "patch-fields", changed: true };
  }

  if (!newStatus) {
    return { rooms, action: "ignored", changed: false };
  }

  const isActive = ACTIVE_ROOM_STATUSES.has(newStatus);
  const wasActive = prevStatus ? ACTIVE_ROOM_STATUSES.has(prevStatus) : false;

  if (wasActive && !isActive) {
    roomStatusById.delete(roomId);
    const nextRooms = sortActiveRooms(rooms.filter((r) => r.roomId !== roomId));
    if (nextRooms.length === 0) roomStatusById.clear();
    return { rooms: nextRooms, action: "remove", changed: true };
  }

  if (isActive && inList) {
    const room = rooms[idx]!;
    const next: ActiveRoom = {
      ...room,
      status: newStatus as ActiveRoom["status"],
      roomCode:
        "room_code" in row
          ? ((row.room_code as string | null) ?? room.roomCode)
          : room.roomCode,
      cardPrice:
        "card_price" in row
          ? Number(row.card_price ?? room.cardPrice)
          : room.cardPrice,
    };
    next.prize = next.cardPrice * next.cardCount;

    const nextRooms = [...rooms];
    nextRooms[idx] = next;
    roomStatusById.set(roomId, newStatus);
    return {
      rooms: sortActiveRooms(nextRooms),
      action: "patch-status",
      changed: true,
    };
  }

  if (isActive && !inList) {
    return { rooms, action: "resync", changed: false };
  }

  return { rooms, action: "ignored", changed: false };
}
