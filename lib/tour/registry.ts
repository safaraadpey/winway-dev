import { gameBrowserTour } from "./configs/gameBrowserTour";
import { gameRoomTour } from "./configs/gameRoomTour";
import { mainPageTour } from "./configs/mainPageTour";
import type { TourConfig } from "./types";

const tours = [mainPageTour, gameBrowserTour, gameRoomTour] as const;

export const tourRegistry = new Map<string, TourConfig>(
  tours.map((tour) => [tour.id, tour])
);

export function getTourConfig(tourId: string): TourConfig | null {
  return tourRegistry.get(tourId) ?? null;
}

export function getRegisteredTours(): TourConfig[] {
  return Array.from(tourRegistry.values());
}
