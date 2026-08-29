"use client";

import { HeaderVisibilityProvider } from "@/lib/contexts/HeaderVisibilityContext";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";
import WatchLayoutClient from "./WatchLayoutClient";

export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="player-layout-root mx-auto flex h-full min-h-screen w-full max-w-[390px] flex-col overflow-hidden bg-[#0E0E0F]"
      style={{
        backgroundColor: "var(--player-layout-bg, #0E0E0F)",
        backgroundImage:
          "var(--player-layout-bg-image, url(/themes/dark/backgrounds/layout_BG.webp))",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <ThemeProvider>
        <HeaderVisibilityProvider>
          <WatchLayoutClient>{children}</WatchLayoutClient>
        </HeaderVisibilityProvider>
      </ThemeProvider>
    </div>
  );
}
