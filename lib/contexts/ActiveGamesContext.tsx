"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import useActiveGames, { type ActiveGames } from "@/lib/hooks/useActiveGames";

const ActiveGamesContext = createContext<ActiveGames | null>(null);

export function ActiveGamesProvider({ children }: { children: ReactNode }) {
  // Single source of truth for user active games + realtime subscription
  const activeGames = useActiveGames();
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

