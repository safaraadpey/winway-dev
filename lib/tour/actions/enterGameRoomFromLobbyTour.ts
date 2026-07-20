import { GAME_ROOM_TOUR_ID } from "@/lib/tour/configs/gameRoomTour";
import { rememberGameRoomPath } from "@/lib/tour/lastGameRoomPath";
import type { TourActionContext } from "@/lib/tour/types";

const FIRST_LOBBY_ROOM_SELECTOR = '[data-tour-id="game-browser-first-room"]';

function resolveFirstLobbyRoomPath(): string | null {
  if (typeof document === "undefined") return null;
  const card = document.querySelector<HTMLElement>(FIRST_LOBBY_ROOM_SELECTOR);
  if (!card) return null;

  const entryRoomId = card.getAttribute("data-entry-room-id");
  if (entryRoomId) {
    return `/player/gameroom?roomId=${encodeURIComponent(entryRoomId)}`;
  }

  const templateId = card.getAttribute("data-template-id");
  if (templateId) {
    return `/player/gameroom?templateId=${encodeURIComponent(templateId)}`;
  }

  return null;
}

export async function enterGameRoomFromLobbyTourAction(
  context: TourActionContext
): Promise<void> {
  const path = resolveFirstLobbyRoomPath();
  await context.complete();
  if (!path) {
    console.warn("[Tour] Lobby enter action: first room target missing");
    return;
  }

  context.queueTourAfterNavigation(GAME_ROOM_TOUR_ID);
  rememberGameRoomPath(path);
  window.location.assign(path);
}
