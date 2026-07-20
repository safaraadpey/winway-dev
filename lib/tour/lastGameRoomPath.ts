const LAST_GAME_ROOM_PATH_KEY = "product_tour:last_gameroom_path";

export function rememberGameRoomPath(pathWithSearch: string): void {
  if (typeof window === "undefined") return;
  if (!pathWithSearch.startsWith("/player/gameroom")) return;
  window.sessionStorage.setItem(LAST_GAME_ROOM_PATH_KEY, pathWithSearch);
}

export function readLastGameRoomPath(): string | null {
  if (typeof window === "undefined") return null;
  const path = window.sessionStorage.getItem(LAST_GAME_ROOM_PATH_KEY);
  if (!path?.startsWith("/player/gameroom")) return null;
  return path;
}

export function clearLastGameRoomPath(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(LAST_GAME_ROOM_PATH_KEY);
}
