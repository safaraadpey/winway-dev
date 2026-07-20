const QUEUED_TOUR_KEY = "product_tour:queued";

export type QueuedTourIntent = {
  userId: string;
  tourId: string;
  createdAt: string;
};

export function readQueuedTourIntent(): QueuedTourIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(QUEUED_TOUR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QueuedTourIntent>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.tourId !== "string"
    ) {
      return null;
    }
    return {
      userId: parsed.userId,
      tourId: parsed.tourId,
      createdAt:
        typeof parsed.createdAt === "string"
          ? parsed.createdAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeQueuedTourIntent(intent: QueuedTourIntent): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(QUEUED_TOUR_KEY, JSON.stringify(intent));
}

export function clearQueuedTourIntent(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(QUEUED_TOUR_KEY);
}

export function queueTourIntent(userId: string, tourId: string): void {
  writeQueuedTourIntent({
    userId,
    tourId,
    createdAt: new Date().toISOString(),
  });
  console.info("[Tour] Queued after navigation", { tourId, userId });
}
