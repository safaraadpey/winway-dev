"use client";

import React, { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import useActiveGames, { type ActiveGames } from "@/lib/hooks/useActiveGames";
import { getActiveGamesOrchestrator } from "@/lib/activeGames/ActiveGamesOrchestrator";

const ActiveGamesContext = createContext<ActiveGames | null>(null);

export function ActiveGamesProvider({ children }: { children: ReactNode }) {
  /**
   * Phase C feature flag (rollback-friendly):
   * - dev default: orchestrator
   * - prod default: legacy
   * Override via NEXT_PUBLIC_ACTIVE_GAMES_SOURCE:
   * - "orchestrator" | "legacy"
   */
  const source =
    process.env.NEXT_PUBLIC_ACTIVE_GAMES_SOURCE ??
    (process.env.NODE_ENV === "production" ? "legacy" : "orchestrator");

  const orchestrator = getActiveGamesOrchestrator();
  const snapshot = useSyncExternalStore(
    orchestrator.subscribe,
    orchestrator.getSnapshot,
    orchestrator.getSnapshot
  );
  const legacyActiveGames = useActiveGames();

  // Single source of truth for user active games + realtime subscription
  const activeGames =
    source === "orchestrator"
      ? { ...snapshot, invalidate: () => orchestrator.invalidate("manual") }
      : legacyActiveGames;

  if (process.env.NODE_ENV !== "production") {
    // Useful to verify swap without touching UI
    console.log("[ActiveGames][Metrics] context-source", { source });
  }
  return (
    <ActiveGamesContext.Provider value={activeGames}>
      {children}
    </ActiveGamesContext.Provider>
  );
}

export function useActiveGamesContext(): ActiveGames {
  const ctx = useContext(ActiveGamesContext);
  if (!ctx) {
    throw new Error("useActiveGamesContext must be used within an ActiveGamesProvider");
  }
  return ctx;
}

