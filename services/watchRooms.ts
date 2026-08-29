import type { LiveRoomSnapshot, RoomResultsResponse } from "@/services/rooms";

export async function fetchWatchLiveRoomSnapshot(
  watchCode: number,
  roomId: string,
  options?: { scope?: "full" | "draws" }
): Promise<LiveRoomSnapshot> {
  const search = new URLSearchParams({
    watchCode: String(watchCode),
  });
  if (options?.scope === "draws") {
    search.set("scope", "draws");
  }

  const res = await fetch(
    `/api/watch/live-room/${encodeURIComponent(roomId)}?${search.toString()}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error("failed to load watch live room");
  }

  return (await res.json()) as LiveRoomSnapshot;
}

export async function fetchWatchRoomResults(
  watchCode: number,
  roomId: string
): Promise<RoomResultsResponse> {
  const search = new URLSearchParams({ watchCode: String(watchCode) });
  const res = await fetch(
    `/api/watch/room-results/${encodeURIComponent(roomId)}?${search.toString()}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error("failed to load watch room results");
  }

  return (await res.json()) as RoomResultsResponse;
}

export async function fetchWatchRoomResultsWhenPrizesReady(
  watchCode: number,
  roomId: string
): Promise<RoomResultsResponse> {
  return fetchWatchRoomResults(watchCode, roomId);
}
