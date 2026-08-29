"use client";

import { HeaderVisibilityProvider } from "@/lib/contexts/HeaderVisibilityContext";

export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-[390px] flex-col overflow-hidden bg-[#0E0E0F]"
      style={{
        backgroundImage: "url(/themes/dark/backgrounds/layout_BG.webp)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <HeaderVisibilityProvider>{children}</HeaderVisibilityProvider>
    </div>
  );
}
