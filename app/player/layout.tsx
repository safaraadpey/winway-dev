"use client";

import React from 'react';
import { HeaderVisibilityProvider } from "@/lib/contexts/HeaderVisibilityContext";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";
import { ActiveGamesProvider } from "@/lib/contexts/ActiveGamesContext";
import { ActiveGamesOrchestratorProvider } from "@/lib/activeGames/ActiveGamesOrchestratorProvider";
import PlayerLayoutClient from "./PlayerLayoutClient";
import EntryBannerModal from "@/components/EntryBannerModal";
import KycResultModal from "@/components/KycResultModal";

/**
 * Layout برای بخش پلیر
 * هدر پلیر از این به بعد فقط `MergedPlayerHeader` است (در `PlayerLayoutClient`)
 * 
 * این layout سروری است و فقط Provider و wrapper کلاینت را رندر می‌کند.
 * منطق کلاینت (useBalances, subscription) در PlayerLayoutClient است.
 */
export default function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="h-dvh min-h-dvh overflow-hidden bg-cover bg-center bg-no-repeat player-layout-root"
      style={{
        backgroundColor: "var(--player-layout-bg, #0E0E0F)",
        backgroundImage: "var(--player-layout-bg-image, url(/themes/dark/backgrounds/layout_BG.webp))",
      }}
    >
      <ThemeProvider>
        <HeaderVisibilityProvider>
        <ActiveGamesOrchestratorProvider>
          <ActiveGamesProvider>
            <PlayerLayoutClient>{children}</PlayerLayoutClient>
            <EntryBannerModal visibleOnPaths={["/player/home"]} />
            <KycResultModal visibleOnPaths={["/player/home"]} />
          </ActiveGamesProvider>
        </ActiveGamesOrchestratorProvider>
      </HeaderVisibilityProvider>
      </ThemeProvider>
    </div>
  );
}

