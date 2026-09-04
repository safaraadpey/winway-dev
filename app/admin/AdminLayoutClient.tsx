"use client";

import React from "react";
import { HeaderVisibilityProvider, useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import DingHeader from "@/components/DingHeader";
import EntryBannerModal from "@/components/EntryBannerModal";
import ClientAuthGuard from "@/components/auth/ClientAuthGuard";
import AdminPanelAuthGuard from "@/components/auth/AdminPanelAuthGuard";

function AdminLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { showHeader, showBackButton, onBackClick, onRefreshClick } = useHeaderVisibility();
  const { tomanBalance, loading } = useBalancesContext();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {showHeader && (
        <div className="flex-shrink-0">
          <DingHeader
            balanceType="toman"
            tomanBalance={tomanBalance}
            loading={loading}
            balanceMuted
            showBackButton={showBackButton}
            onBackClick={onBackClick || undefined}
            showRefreshButton
            onRefreshClick={onRefreshClick ?? undefined}
          />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
      <EntryBannerModal visibleOnPaths={["/admin/dashboard"]} />
    </div>
  );
}

export default function AdminLayoutClient({
  children,
  isLoginPage,
}: {
  children: React.ReactNode;
  isLoginPage: boolean;
}) {
  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <HeaderVisibilityProvider>
      <ClientAuthGuard blockShell={false} loginPath="/admin/login">
        <AdminPanelAuthGuard>
          <AdminLayoutContent>{children}</AdminLayoutContent>
        </AdminPanelAuthGuard>
      </ClientAuthGuard>
    </HeaderVisibilityProvider>
  );
}
