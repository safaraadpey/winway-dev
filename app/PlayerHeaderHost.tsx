"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import MergedPlayerHeader from "@/components/MergedPlayerHeader";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";

/**
 * Root-level player header host — persists across /player/* route changes.
 * No data fetching; reads from global contexts only.
 */
export default function PlayerHeaderHost() {
  const pathname = usePathname();
  const isPlayerRoute = pathname?.startsWith("/player") ?? false;

  const { showHeader, showBackButton, onBackClick, balanceRefreshDisabled } =
    useHeaderVisibility();
  const {
    dingBalance,
    tomanBalance,
    lockedTomanBalance,
    hasHydrated,
    isRefreshing,
    isAnimating,
    isTomanAnimating,
    refreshAllBalances,
  } = useBalancesContext();

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !isPlayerRoute) return;
    console.log("[PlayerHeader] mounted");
  }, [isPlayerRoute]);

  if (!isPlayerRoute || !showHeader) return null;

  const availableTomanBalance = Math.max(0, tomanBalance || 0);

  return (
    <div className="sticky top-0 z-50 flex-shrink-0">
      <MergedPlayerHeader
        dingBalance={dingBalance || 0}
        tomanBalance={availableTomanBalance}
        hasHydrated={hasHydrated}
        isRefreshing={isRefreshing}
        isAnimating={isAnimating}
        isTomanAnimating={isTomanAnimating}
        showBackButton={showBackButton}
        onBackClick={onBackClick || undefined}
        onRefreshBalances={() => refreshAllBalances?.({ force: true })}
        refreshDisabled={isRefreshing || balanceRefreshDisabled}
      />
    </div>
  );
}
