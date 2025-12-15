"use client";

import React from 'react';
import { HeaderVisibilityProvider } from "@/lib/contexts/HeaderVisibilityContext";
import { ActiveGamesProvider } from "@/lib/contexts/ActiveGamesContext";
import PlayerLayoutClient from "./PlayerLayoutClient";
import EntryBannerModal from "@/components/EntryBannerModal";

/**
 * Layout برای بخش پلیر
 * شامل DingHeader (پیش‌فرض: نمایش) + PlayerStatusBar
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
    <div className="min-h-screen bg-[#0E0E0F]">
      <HeaderVisibilityProvider>
        <ActiveGamesProvider>
          <PlayerLayoutClient>{children}</PlayerLayoutClient>
          <EntryBannerModal />
        </ActiveGamesProvider>
      </HeaderVisibilityProvider>
    </div>
  );
}

