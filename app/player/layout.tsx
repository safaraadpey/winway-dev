"use client";

import React from 'react';
import { HeaderVisibilityProvider } from "@/lib/contexts/HeaderVisibilityContext";
import { ActiveGamesProvider } from "@/lib/contexts/ActiveGamesContext";
import { ActiveGamesOrchestratorProvider } from "@/lib/activeGames/ActiveGamesOrchestratorProvider";
import PlayerLayoutClient from "./PlayerLayoutClient";
import EntryBannerModal from "@/components/EntryBannerModal";

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
      className="h-dvh min-h-screen overflow-hidden bg-[#0E0E0F] bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url(/backgrounds/layout_BG.webp)" }}
    >
      <HeaderVisibilityProvider>
        <ActiveGamesOrchestratorProvider>
          <ActiveGamesProvider>
            <PlayerLayoutClient>{children}</PlayerLayoutClient>
            <EntryBannerModal visibleOnPaths={["/player/home"]} />
          </ActiveGamesProvider>
        </ActiveGamesOrchestratorProvider>
      </HeaderVisibilityProvider>
    </div>
  );
}

