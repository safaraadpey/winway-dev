import type { TourConfig, TourProgress, TourStorage } from "./types";

const STORAGE_PREFIX = "product_tour:v1";

function initialProgress(tour: TourConfig): TourProgress {
  return {
    tourId: tour.id,
    version: tour.version,
    status: "not_started",
    currentStep: 0,
    updatedAt: new Date().toISOString(),
  };
}

function storageKey(userId: string, tourId: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(userId)}:${tourId}`;
}

/**
 * User-scoped persistence behind a replaceable interface. A future API adapter
 * only needs to implement TourStorage; the engine and configs remain unchanged.
 */
export class LocalTourStorage implements TourStorage {
  readonly source = "localStorage";

  async get(userId: string, tour: TourConfig): Promise<TourProgress> {
    if (typeof window === "undefined") return initialProgress(tour);

    try {
      const raw = window.localStorage.getItem(storageKey(userId, tour.id));
      if (!raw) return initialProgress(tour);

      const parsed = JSON.parse(raw) as Partial<TourProgress>;
      if (
        parsed.tourId !== tour.id ||
        parsed.version !== tour.version ||
        !["not_started", "in_progress", "completed", "skipped"].includes(
          String(parsed.status)
        )
      ) {
        return initialProgress(tour);
      }

      return {
        tourId: tour.id,
        version: tour.version,
        status: parsed.status as TourProgress["status"],
        currentStep:
          typeof parsed.currentStep === "number"
            ? Math.max(
                0,
                Math.min(parsed.currentStep, Math.max(0, tour.steps.length - 1))
              )
            : 0,
        updatedAt:
          typeof parsed.updatedAt === "string"
            ? parsed.updatedAt
            : new Date().toISOString(),
      };
    } catch (error) {
      console.warn("[Tour] Failed to read local progress", {
        tourId: tour.id,
        error,
      });
      return initialProgress(tour);
    }
  }

  async set(userId: string, progress: TourProgress): Promise<void> {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        storageKey(userId, progress.tourId),
        JSON.stringify(progress)
      );
    } catch (error) {
      console.warn("[Tour] Failed to persist local progress", {
        tourId: progress.tourId,
        error,
      });
    }
  }

  async reset(userId: string, tour: TourConfig): Promise<TourProgress> {
    const progress = initialProgress(tour);
    await this.set(userId, progress);
    return progress;
  }
}

export const localTourStorage = new LocalTourStorage();

/** Replace this binding with an API-backed TourStorage adapter when available. */
export const tourStorage: TourStorage = localTourStorage;
