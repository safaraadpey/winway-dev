"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { BalancesProvider } from "@/lib/contexts/BalancesContext";
import { SessionProvider } from "@/lib/contexts/SessionContext";
import { PlayerProfileProvider } from "@/lib/contexts/PlayerProfileContext";
import {
  HeaderVisibilityProvider,
  useHeaderVisibility,
} from "@/lib/contexts/HeaderVisibilityContext";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";
import PlayerHeaderHost from "@/app/PlayerHeaderHost";
import GameEndResultsListener from "@/components/GameEndResultsListener";
import { ActiveGamesOrchestratorProvider } from "@/lib/activeGames/ActiveGamesOrchestratorProvider";
import { ActiveGamesProvider } from "@/lib/contexts/ActiveGamesContext";
import { InstallPromptProvider } from "@/lib/contexts/InstallPromptContext";
import { TourProvider } from "@/lib/contexts/TourContext";
import { isAgentPanelLocation, isAgentPanelPath } from "@/lib/auth/isAgentPanelPath";

export default function GlobalUserStateClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const skipPlayerGameStack =
    isAgentPanelPath(pathname) || isAgentPanelLocation();

  useEffect(() => {
    if (!skipPlayerGameStack) return;
    console.info("[AgentPanel] Player game stack disabled", { pathname });
  }, [pathname, skipPlayerGameStack]);

  const withPlayerGameStack = (
    <ActiveGamesOrchestratorProvider>
      <ActiveGamesProvider>
        {children}
        <GameEndResultsListener />
      </ActiveGamesProvider>
    </ActiveGamesOrchestratorProvider>
  );

  return (
    <InstallPromptProvider>
      <SessionProvider>
        <PlayerProfileProvider>
          <TourProvider>
            <BalancesProvider>
              <ThemeProvider>
                <HeaderVisibilityProvider>
                  <AppChromeColumn>
                    <PlayerHeaderHost />
                    {skipPlayerGameStack ? children : withPlayerGameStack}
                  </AppChromeColumn>
                </HeaderVisibilityProvider>
              </ThemeProvider>
            </BalancesProvider>
          </TourProvider>
        </PlayerProfileProvider>
      </SessionProvider>
    </InstallPromptProvider>
  );
}

function AppChromeColumn({ children }: { children: React.ReactNode }) {
  const { fullPageScroll } = useHeaderVisibility();

  return (
    <div
      className={
        fullPageScroll
          ? "flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          : "flex min-h-0 flex-1 flex-col overflow-hidden"
      }
    >
      {children}
    </div>
  );
}


