import { GAME_BROWSER_TOUR_ID } from "@/lib/tour/configs/gameBrowserTour";
import { GAME_ROOM_TOUR_ID } from "@/lib/tour/configs/gameRoomTour";
import { MAIN_PAGE_TOUR_ID } from "@/lib/tour/configs/mainPageTour";

/** Player onboarding tours shown in order (Main → Lobby via CTA → Game room on enter). */
export const PLAYER_ONBOARDING_TOUR_IDS = [
  MAIN_PAGE_TOUR_ID,
  GAME_BROWSER_TOUR_ID,
  GAME_ROOM_TOUR_ID,
] as const;

export type PlayerOnboardingTourId =
  (typeof PLAYER_ONBOARDING_TOUR_IDS)[number];
