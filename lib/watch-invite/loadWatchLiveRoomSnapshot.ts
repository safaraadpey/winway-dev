import { loadLiveRoomSnapshotForRoom } from "@/lib/liveRoom/loadLiveRoomSnapshotCore";
import { assertWatchFinishedRoomAccess } from "@/lib/watch-invite/assertWatchFinishedRoomAccess";

export async function loadWatchLiveRoomSnapshot(
  watchCode: number,
  roomId: string,
  options?: { scope?: "full" | "draws" }
) {
  const access = await assertWatchFinishedRoomAccess(watchCode, roomId);
  if (!access) {
    throw new Error("watch_room_not_allowed");
  }

  return loadLiveRoomSnapshotForRoom(roomId, {
    scope: options?.scope ?? "full",
    currentUserId: null,
    anonymizePlayerNames: true,
  });
}
