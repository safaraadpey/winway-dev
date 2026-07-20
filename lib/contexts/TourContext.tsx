"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { useSession } from "@/lib/contexts/SessionContext";
import { HARD_EXIT_EVENT } from "@/lib/auth/hardExit";
import { getTourConfig } from "@/lib/tour/registry";
import { tourStorage } from "@/lib/tour/storage";
import type {
  ConsumeQueuedTourResult,
  TourActionContext,
  TourConfig,
  TourProgress,
} from "@/lib/tour/types";
import {
  clearQueuedTourIntent,
  queueTourIntent,
  readQueuedTourIntent,
} from "@/lib/tour/tourQueue";
import { readLastGameRoomPath } from "@/lib/tour/lastGameRoomPath";
import { GAME_ROOM_TOUR_ID } from "@/lib/tour/configs/gameRoomTour";

const PENDING_TOUR_KEY = "product_tour:pending";

type ActiveTour = {
  config: TourConfig;
  stepIndex: number;
};

type TourContextValue = {
  activeTourId: string | null;
  startTour: (tourId: string) => Promise<void>;
  maybeStartTour: (tourId: string) => Promise<void>;
  restartTour: (tourId: string) => Promise<void>;
  consumeQueuedTourStart: (tourId: string) => Promise<ConsumeQueuedTourResult>;
  getTourProgress: (tourId: string) => Promise<TourProgress | null>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  skip: () => Promise<void>;
  close: () => Promise<void>;
};

const TourContext = createContext<TourContextValue | null>(null);

function progressFor(
  config: TourConfig,
  status: TourProgress["status"],
  currentStep: number
): TourProgress {
  return {
    tourId: config.id,
    version: config.version,
    status,
    currentStep,
    updatedAt: new Date().toISOString(),
  };
}

function tourNavigationPath(config: TourConfig): string {
  if (!config.route) return window.location.pathname;
  if (config.id === GAME_ROOM_TOUR_ID) {
    return readLastGameRoomPath() ?? config.route;
  }
  return config.route;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { userId, authReady } = useSession();
  const pathname = usePathname();
  const [active, setActive] = useState<ActiveTour | null>(null);
  const autoStartLockRef = useRef(false);
  const customActionLockRef = useRef(false);
  const controlsRef = useRef<
    Pick<TourActionContext, "next" | "previous" | "close">
  >({
    next: async () => {},
    previous: async () => {},
    close: async () => {},
  });

  const persist = useCallback(
    async (
      config: TourConfig,
      status: TourProgress["status"],
      stepIndex: number
    ) => {
      if (!userId) return;
      await tourStorage.set(
        userId,
        progressFor(config, status, stepIndex)
      );
    },
    [userId]
  );

  const activate = useCallback(
    async (config: TourConfig, stepIndex: number) => {
      const safeIndex = Math.max(
        0,
        Math.min(stepIndex, config.steps.length - 1)
      );
      await persist(config, "in_progress", safeIndex);
      setActive({ config, stepIndex: safeIndex });
      console.info("[Tour] Started", {
        tourId: config.id,
        stepIndex: safeIndex,
        source: tourStorage.source,
      });
    },
    [persist]
  );

  const startTour = useCallback(
    async (tourId: string) => {
      const config = getTourConfig(tourId);
      if (!config || !userId || config.steps.length === 0) return;

      const saved = await tourStorage.get(userId, config);
      const startIndex =
        saved.status === "in_progress" ? saved.currentStep : 0;

      if (
        config.route &&
        typeof window !== "undefined" &&
        window.location.pathname !== config.route
      ) {
        await persist(config, "in_progress", startIndex);
        window.sessionStorage.setItem(
          PENDING_TOUR_KEY,
          JSON.stringify({ tourId: config.id, userId, stepIndex: startIndex })
        );
        window.location.assign(tourNavigationPath(config));
        return;
      }

      await activate(config, startIndex);
    },
    [activate, persist, userId]
  );

  const maybeStartTour = useCallback(
    async (tourId: string) => {
      const config = getTourConfig(tourId);
      if (!config || !userId || active || config.steps.length === 0) return;
      if (autoStartLockRef.current) return;

      autoStartLockRef.current = true;
      try {
        const saved = await tourStorage.get(userId, config);
        if (saved.status !== "not_started") return;
        await activate(config, 0);
      } finally {
        autoStartLockRef.current = false;
      }
    },
    [activate, active, userId]
  );

  const restartTour = useCallback(
    async (tourId: string) => {
      const config = getTourConfig(tourId);
      if (!config || !userId || config.steps.length === 0) return;
      await tourStorage.reset(userId, config);
      setActive(null);
      await startTour(tourId);
    },
    [startTour, userId]
  );

  const getTourProgress = useCallback(
    async (tourId: string) => {
      const config = getTourConfig(tourId);
      if (!config || !userId) return null;
      return tourStorage.get(userId, config);
    },
    [userId]
  );

  const close = useCallback(async () => {
    if (!active) return;
    await persist(active.config, "in_progress", active.stepIndex);
    setActive(null);
    console.info("[Tour] Closed", {
      tourId: active.config.id,
      stepIndex: active.stepIndex,
    });
  }, [active, persist]);

  const skip = useCallback(async () => {
    if (!active) return;
    await persist(active.config, "skipped", active.stepIndex);
    setActive(null);
    console.info("[Tour] Skipped", { tourId: active.config.id });
  }, [active, persist]);

  const finish = useCallback(async () => {
    if (!active) return;
    await persist(active.config, "completed", active.stepIndex);
    setActive(null);
    console.info("[Tour] Completed", { tourId: active.config.id });
  }, [active, persist]);

  const complete = finish;

  const queueTourAfterNavigation = useCallback(
    (tourId: string) => {
      if (!userId) return;
      queueTourIntent(userId, tourId);
    },
    [userId]
  );

  const buildActionContext = useCallback(
    (config: TourConfig, stepIndex: number): TourActionContext => {
      const step = config.steps[stepIndex];
      return {
        tourId: config.id,
        stepId: step.id,
        stepIndex,
        ...controlsRef.current,
        complete,
        queueTourAfterNavigation,
      };
    },
    [complete, queueTourAfterNavigation]
  );

  const consumeQueuedTourStart = useCallback(
    async (tourId: string): Promise<ConsumeQueuedTourResult> => {
      if (!userId) return "no_queue";
      const queued = readQueuedTourIntent();
      if (!queued || queued.userId !== userId || queued.tourId !== tourId) {
        return "no_queue";
      }

      clearQueuedTourIntent();

      const config = getTourConfig(tourId);
      if (!config || config.steps.length === 0) {
        console.warn("[Tour] Queued tour config missing", { tourId });
        return "cleared_ineligible";
      }

      if (
        config.route &&
        typeof window !== "undefined" &&
        window.location.pathname !== config.route
      ) {
        console.info("[Tour] Queued tour skipped (wrong route)", {
          tourId,
          route: config.route,
        });
        return "cleared_ineligible";
      }

      const saved = await tourStorage.get(userId, config);
      if (saved.status !== "not_started") {
        console.info("[Tour] Queued tour skipped (ineligible status)", {
          tourId,
          status: saved.status,
        });
        return "cleared_ineligible";
      }

      if (active) {
        console.info("[Tour] Queued tour skipped (tour already active)", {
          tourId,
        });
        return "cleared_ineligible";
      }

      await activate(config, 0);
      return "started";
    },
    [activate, active, userId]
  );

  const previous = useCallback(async () => {
    if (!active) return;
    const previousIndex = Math.max(0, active.stepIndex - 1);
    const context = buildActionContext(active.config, active.stepIndex);
    await active.config.steps[active.stepIndex].previousAction?.(context);
    await persist(active.config, "in_progress", previousIndex);
    setActive({ ...active, stepIndex: previousIndex });
  }, [active, buildActionContext, persist]);

  const next = useCallback(async () => {
    if (!active) return;
    const step = active.config.steps[active.stepIndex];
    const nextIndex = active.stepIndex + 1;
    const context = buildActionContext(active.config, active.stepIndex);
    await step.nextAction?.(context);
    if (nextIndex >= active.config.steps.length) {
      await finish();
      return;
    }
    await persist(active.config, "in_progress", nextIndex);
    setActive({ ...active, stepIndex: nextIndex });
  }, [active, buildActionContext, finish, persist]);

  const runCustomAction = useCallback(async () => {
    if (!active || customActionLockRef.current) return;
    const step = active.config.steps[active.stepIndex];
    if (!step.customAction) return;

    customActionLockRef.current = true;
    try {
      const context = buildActionContext(active.config, active.stepIndex);
      await step.customAction.action(context);
    } finally {
      customActionLockRef.current = false;
    }
  }, [active, buildActionContext]);

  controlsRef.current = { next, previous, close };

  const handleTargetMissing = useCallback(async () => {
    if (!active) return;
    console.warn("[Tour] Target not found", {
      tourId: active.config.id,
      stepId: active.config.steps[active.stepIndex]?.id,
      target: active.config.steps[active.stepIndex]?.target,
    });
    const nextIndex = active.stepIndex + 1;
    if (nextIndex >= active.config.steps.length) {
      await close();
      return;
    }
    await persist(active.config, "in_progress", nextIndex);
    setActive({ ...active, stepIndex: nextIndex });
  }, [active, close, persist]);

  useEffect(() => {
    if (!authReady || !userId || typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(PENDING_TOUR_KEY);
    if (!raw) return;

    try {
      const pending = JSON.parse(raw) as {
        tourId?: string;
        userId?: string;
        stepIndex?: number;
      };
      const config = pending.tourId
        ? getTourConfig(pending.tourId)
        : null;
      if (
        config &&
        pending.userId === userId &&
        (!config.route || config.route === window.location.pathname)
      ) {
        window.sessionStorage.removeItem(PENDING_TOUR_KEY);
        void activate(config, pending.stepIndex ?? 0);
      }
    } catch {
      window.sessionStorage.removeItem(PENDING_TOUR_KEY);
    }
  }, [activate, authReady, userId]);

  useEffect(() => {
    if (!active?.config.route || !pathname) return;
    if (pathname !== active.config.route) {
      setActive(null);
      console.info("[Tour] Closed on route change", {
        tourId: active.config.id,
        from: active.config.route,
        to: pathname,
      });
    }
  }, [active, pathname]);

  useEffect(() => {
    const handleHardExit = () => {
      setActive(null);
      window.sessionStorage.removeItem(PENDING_TOUR_KEY);
      clearQueuedTourIntent();
    };
    window.addEventListener(HARD_EXIT_EVENT, handleHardExit);
    return () => window.removeEventListener(HARD_EXIT_EVENT, handleHardExit);
  }, []);

  useEffect(() => {
    setActive(null);
    clearQueuedTourIntent();
  }, [userId]);

  const value = useMemo<TourContextValue>(
    () => ({
      activeTourId: active?.config.id ?? null,
      startTour,
      maybeStartTour,
      restartTour,
      consumeQueuedTourStart,
      getTourProgress,
      next,
      previous,
      skip,
      close,
    }),
    [
      active?.config.id,
      close,
      consumeQueuedTourStart,
      getTourProgress,
      maybeStartTour,
      next,
      previous,
      restartTour,
      skip,
      startTour,
    ]
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {active ? (
        <TourOverlay
          tour={active.config}
          stepIndex={active.stepIndex}
          onNext={next}
          onPrevious={previous}
          onSkip={skip}
          onClose={close}
          onCustomAction={runCustomAction}
          onTargetMissing={handleTargetMissing}
        />
      ) : null}
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return context;
}
