export const MY_ACTIVE_GAME_CHIP_EVENT = "app:my-active-game-chip";
export const ACTIVE_GAME_ENTER_LIVE_PARAM = "enterLive";

export type MyActiveGameChipDetail = {
  roomId: string;
  status: string;
};

const LIVE_STATUSES = new Set(["playing", "live", "settling", "running"]);

export function isLiveActiveGameStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return LIVE_STATUSES.has(status.trim().toLowerCase());
}

export function buildMyActiveGameRoomHref(
  roomId: string,
  status: string | null | undefined
): string {
  const base = `/player/gameroom?roomId=${encodeURIComponent(roomId)}`;
  if (!isLiveActiveGameStatus(status)) {
    return base;
  }
  return `${base}&${ACTIVE_GAME_ENTER_LIVE_PARAM}=1`;
}

export function dispatchMyActiveGameChip(detail: MyActiveGameChipDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<MyActiveGameChipDetail>(MY_ACTIVE_GAME_CHIP_EVENT, { detail })
  );
}
