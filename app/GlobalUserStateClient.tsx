"use client";

import React from "react";
import { BalancesProvider } from "@/lib/contexts/BalancesContext";
import { SessionProvider } from "@/lib/contexts/SessionContext";
import GameEndResultsListener from "@/components/GameEndResultsListener";
import { ActiveGamesOrchestratorProvider } from "@/lib/activeGames/ActiveGamesOrchestratorProvider";
import { ActiveGamesProvider } from "@/lib/contexts/ActiveGamesContext";

export default function GlobalUserStateClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <BalancesProvider>
        <ActiveGamesOrchestratorProvider>
          <ActiveGamesProvider>
            {children}
            <GameEndResultsListener />
          </ActiveGamesProvider>
        </ActiveGamesOrchestratorProvider>
      </BalancesProvider>
    </SessionProvider>
  );
}


