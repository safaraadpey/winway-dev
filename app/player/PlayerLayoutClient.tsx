"use client";

import React, { useEffect } from "react";
import {
  WALLET_PRIZE_CELEBRATE_EVENT,
  type WalletPrizeCelebrateDetail,
} from "@/lib/walletPrizeCelebrate";
import { usePathname } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import { useSession } from "@/lib/contexts/SessionContext";
import { unlockAndPreloadOnUserGesture } from "@/lib/number-audio";
import MergedPlayerHeader from "@/components/MergedPlayerHeader";
import MyActiveGames from "@/components/MyActiveGames";

/**
 * Client Component wrapper برای منطق کلاینت در Player Layout
 * این کامپوننت useBalances و subscription را مدیریت می‌کند
 */
export default function PlayerLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const session = useSession();
  const { showHeader, showBackButton, onBackClick, balanceRefreshDisabled } =
    useHeaderVisibility();
  const {
    dingBalance,
    tomanBalance,
    lockedTomanBalance,
    loading,
    isAnimating,
    isTomanAnimating,
    triggerTomanCelebrate,
    refreshAllBalances,
    scheduleWalletBalanceSync,
  } = useBalancesContext();

  // نکته: در بک‌اند، هنگام hold برای join، هم balance کم می‌شود و هم locked_amount زیاد.
  // بنابراین `wallets.balance` خودش موجودی قابل استفاده است و نباید دوباره locked_amount از آن کم شود.
  const availableTomanBalance = Math.max(0, tomanBalance || 0);

  // Unlock shared WebAudio (number + ding) on first user gesture in player shell.
  useEffect(() => {
    return unlockAndPreloadOnUserGesture(window);
  }, []);

  // دیباگ: لاگ وضعیت subscription و balance
  useEffect(() => {
    console.log('[PlayerLayoutClient] Mounted - Client Component is active');
    console.log('[PlayerLayoutClient] Balance state:', {
      dingBalance,
      tomanBalance,
      lockedTomanBalance,
      availableTomanBalance,
      loading,
      isAnimating,
    });
  }, []);

  // Dev-only lifecycle log for route transitions inside /player
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

  // Presence ping for Warm crypto watch (online window ≈ 2 minutes).
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

  useEffect(() => {
    console.log('[PlayerLayoutClient] Balance updated:', {
      dingBalance,
      tomanBalance,
      lockedTomanBalance,
      availableTomanBalance,
      isAnimating,
      timestamp: new Date().toISOString(),
    });
  }, [dingBalance, tomanBalance, lockedTomanBalance, availableTomanBalance, isAnimating]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex-shrink-0 sticky top-0 z-50">
        {showHeader && (
          <MergedPlayerHeader
            dingBalance={dingBalance || 0}
            tomanBalance={availableTomanBalance}
            loading={loading}
            isAnimating={isAnimating}
            isTomanAnimating={isTomanAnimating}
            showBackButton={showBackButton}
            onBackClick={onBackClick || undefined}
            onRefreshBalances={refreshAllBalances}
            refreshDisabled={loading || balanceRefreshDisabled}
          />
        )}
        <MyActiveGames />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

