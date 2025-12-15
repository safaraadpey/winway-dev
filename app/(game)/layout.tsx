"use client";

import React from 'react';
import { HeaderVisibilityProvider, useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import DingHeader from "@/components/DingHeader";

function GameLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { showHeader, showBackButton, onBackClick } = useHeaderVisibility();
  const { dingBalance, loading, isAnimating } = useBalancesContext();

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
      {children}
    </>
  );
}

/**
 * Layout برای بخش بازی
 * شامل DingHeader (پیش‌فرض: نمایش) - بدون PlayerStatusBar
 */
export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HeaderVisibilityProvider>
      <GameLayoutContent>{children}</GameLayoutContent>
    </HeaderVisibilityProvider>
  );
}

