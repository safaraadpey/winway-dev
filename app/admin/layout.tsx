"use client";

import React from 'react';
import { HeaderVisibilityProvider, useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import DingHeader from "@/components/DingHeader";
import EntryBannerModal from "@/components/EntryBannerModal";
import ClientAuthGuard from "@/components/auth/ClientAuthGuard";

function AdminLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { showHeader, showBackButton, onBackClick } = useHeaderVisibility();
  const { tomanBalance, loading } = useBalancesContext();

  return (
    <>
      {showHeader && (
        <DingHeader 
          balanceType="toman"
          tomanBalance={tomanBalance} 
          loading={loading}
          showBackButton={showBackButton}
          onBackClick={onBackClick || undefined}
        />
      )}
      {children}
      <EntryBannerModal visibleOnPaths={["/admin/dashboard"]} />
    </>
  );
}

/**
 * Layout برای بخش ادمین
 * شامل DingHeader (پیش‌فرض: نمایش) - بدون PlayerStatusBar
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HeaderVisibilityProvider>
      <ClientAuthGuard>
        <AdminLayoutContent>{children}</AdminLayoutContent>
      </ClientAuthGuard>
    </HeaderVisibilityProvider>
  );
}

