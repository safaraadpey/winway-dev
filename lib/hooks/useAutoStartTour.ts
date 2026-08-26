"use client";

import { useEffect, useRef } from "react";
import { useTour } from "@/lib/contexts/TourContext";

type AutoStartOptions = {
  /** Try a chained queue intent before first-time auto-start. */
  preferQueuedIntent?: boolean;
};

export function useAutoStartTour(
  tourId: string,
  ready = true,
  options?: AutoStartOptions
) {
  const { maybeStartTour, consumeQueuedTourStart } = useTour();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!ready) {
      attemptedRef.current = false;
      return;
    }
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    void (async () => {
      if (options?.preferQueuedIntent) {
        const queued = await consumeQueuedTourStart(tourId);
        if (queued !== "no_queue") return;
      }
      await maybeStartTour(tourId);
    })();
  }, [
    consumeQueuedTourStart,
    maybeStartTour,
    options?.preferQueuedIntent,
    ready,
    tourId,
  ]);
}
