"use client";

import React from "react";
import PlayerLayoutClient from "./PlayerLayoutClient";
import EntryBannerModal from "@/components/EntryBannerModal";
import KycResultModal from "@/components/KycResultModal";
import TicTacToeHost from "@/components/tic-tac-toe/TicTacToeHost";

/**
 * Layout for player section.
 * Header (MergedPlayerHeader) lives at root in PlayerHeaderHost.
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
        backgroundImage:
          "var(--player-layout-bg-image, url(/themes/dark/backgrounds/layout_BG.webp))",
      }}
    >
      <PlayerLayoutClient>{children}</PlayerLayoutClient>
      <EntryBannerModal visibleOnPaths={["/player/home"]} />
      <KycResultModal visibleOnPaths={["/player/home"]} />
      <TicTacToeHost />
    </div>
  );
}
