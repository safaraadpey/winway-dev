"use client";

import React from 'react';
import { HeaderVisibilityProvider, useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import DingHeader from "@/components/DingHeader";
import ClientAuthGuard from "@/components/auth/ClientAuthGuard";

function MessagesLayoutContent({
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
 * Layout برای بخش پیام‌ها (مسیر /messages)
 * شامل DingHeader (پیش‌فرض: نمایش) - بدون PlayerStatusBar
 */
export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HeaderVisibilityProvider>
      <ClientAuthGuard>
        <MessagesLayoutContent>{children}</MessagesLayoutContent>
      </ClientAuthGuard>
    </HeaderVisibilityProvider>
  );
}


