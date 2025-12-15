"use client";

import React, { useEffect } from 'react';
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import DingHeader from "@/components/DingHeader";
import PlayerStatusBar from "@/components/PlayerStatusBar";
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
  const { showHeader, showBackButton, onBackClick, showStatusBar } = useHeaderVisibility();
  const { dingBalance, tomanBalance, lockedTomanBalance, loading, isAnimating } = useBalancesContext();

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
    <>
      {showHeader && (
        <DingHeader 
          dingBalance={dingBalance} 
          loading={loading}
          isAnimating={isAnimating}
          showBackButton={showBackButton}
          onBackClick={onBackClick || undefined}
        />
      )}
      <div className="sticky top-0 z-40 bg-[#0E0E0F]">
        {showStatusBar && (
          <PlayerStatusBar
            tomanBalance={availableTomanBalance}
            loading={loading}
          />
        )}
        <MyActiveGames />
      </div>
      {children}
    </>
  );
}

