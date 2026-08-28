"use client";

import React from 'react';
import { HeaderVisibilityProvider } from "@/lib/contexts/HeaderVisibilityContext";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";
import PlayerLayoutClient from "./PlayerLayoutClient";
import EntryBannerModal from "@/components/EntryBannerModal";
import KycResultModal from "@/components/KycResultModal";
import TicTacToeHost from "@/components/tic-tac-toe/TicTacToeHost";

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
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-cover bg-center bg-no-repeat player-layout-root"
      style={{
        backgroundColor: "var(--player-layout-bg, #0E0E0F)",
        backgroundImage: "var(--player-layout-bg-image, url(/themes/dark/backgrounds/layout_BG.webp))",
      }}
    >
      <ThemeProvider>
        <HeaderVisibilityProvider>
          <PlayerLayoutClient>{children}</PlayerLayoutClient>
          <EntryBannerModal visibleOnPaths={["/player/home"]} />
          <KycResultModal visibleOnPaths={["/player/home"]} />
          <TicTacToeHost />
        </HeaderVisibilityProvider>
      </ThemeProvider>
    </div>
  );
}

