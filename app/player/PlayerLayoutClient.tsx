"use client";

import React, { useEffect } from 'react';
import { usePathname } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
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
  const { showHeader, showBackButton, onBackClick } = useHeaderVisibility();
  const {
    dingBalance,
    tomanBalance,
    lockedTomanBalance,
    loading,
    isAnimating,
    refreshAllBalances,
  } = useBalancesContext();

  // نکته: در بک‌اند، هنگام hold برای join، هم balance کم می‌شود و هم locked_amount زیاد.
  // بنابراین `wallets.balance` خودش موجودی قابل استفاده است و نباید دوباره locked_amount از آن کم شود.
  const availableTomanBalance = Math.max(0, tomanBalance || 0);

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
    <div className="flex flex-col h-dvh overflow-hidden">
      <div className="flex-shrink-0 sticky top-0 z-50 bg-[#0E0E0F]">
        {showHeader && (
          <MergedPlayerHeader
            dingBalance={dingBalance || 0}
            tomanBalance={availableTomanBalance}
            loading={loading}
            isAnimating={isAnimating}
            showBackButton={showBackButton}
            onBackClick={onBackClick || undefined}
            onRefreshBalances={refreshAllBalances}
            refreshDisabled={loading}
          />
        )}
        <MyActiveGames />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

