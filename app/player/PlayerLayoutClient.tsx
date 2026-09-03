"use client";

import React, { useEffect } from "react";
import {
  WALLET_PRIZE_CELEBRATE_EVENT,
  type WalletPrizeCelebrateDetail,
} from "@/lib/walletPrizeCelebrate";
import { usePathname } from "next/navigation";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import { useSession } from "@/lib/contexts/SessionContext";
import { unlockAndPreloadOnUserGesture } from "@/lib/number-audio";
import MyActiveGames from "@/components/MyActiveGames";

/**
 * Client Component wrapper for player layout shell (active games, presence).
 * Header is rendered at root via PlayerHeaderHost.
 */
export default function PlayerLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const session = useSession();
  const {
    triggerTomanCelebrate,
    scheduleWalletBalanceSync,
  } = useBalancesContext();

  useEffect(() => {
    return unlockAndPreloadOnUserGesture(window);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    console.log("[ActiveGames][Lifecycle] route-change", { pathname });
  }, [pathname]);

  useEffect(() => {
    const onPrizeCelebrate = (event: Event) => {
      const amount = (event as CustomEvent<WalletPrizeCelebrateDetail>).detail
        ?.amount;
      triggerTomanCelebrate?.();
      scheduleWalletBalanceSync?.(
        amount != null ? `prize-celebrate:${amount}` : "prize-celebrate"
      );
    };
    window.addEventListener(WALLET_PRIZE_CELEBRATE_EVENT, onPrizeCelebrate);
    return () => {
      window.removeEventListener(WALLET_PRIZE_CELEBRATE_EVENT, onPrizeCelebrate);
    };
  }, [triggerTomanCelebrate, scheduleWalletBalanceSync]);

  useEffect(() => {
    let stopped = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function ping() {
      try {
        const token = session.accessToken;
        if (!token || document.visibilityState === "hidden") return;
        await fetch("/api/me/ping-presence", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // silent — Warm Watch degrades gracefully
      }
    }

    if (!session.authReady || !session.accessToken) return;

    void ping();
    interval = setInterval(() => {
      if (!stopped) void ping();
    }, 60_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !stopped) void ping();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session.authReady, session.accessToken, session.tokenVersion]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex-shrink-0 sticky top-0 z-40">
        <MyActiveGames />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
