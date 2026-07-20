import { MENU_ENTRIES } from "@/lib/theme/menuEntries";
import { GAME_BROWSER_TOUR_ID } from "@/lib/tour/configs/gameBrowserTour";
import type { TourActionContext } from "@/lib/tour/types";

const GAME_ROOM_HREF =
  MENU_ENTRIES.find((entry) => entry.id === "gameRoom")?.href ?? "/player/lobby";

export async function enterGameLobbyFromMainTourAction(
  context: TourActionContext
): Promise<void> {
  await context.complete();
  context.queueTourAfterNavigation(GAME_BROWSER_TOUR_ID);
  if (typeof window !== "undefined") {
    window.location.assign(GAME_ROOM_HREF);
  }
}
