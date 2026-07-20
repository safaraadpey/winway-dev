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
  const { showHeader, showBackButton, onBackClick } = useHeaderVisibility();
  const { tomanBalance, loading } = useBalancesContext();

  return (
    <>
      {showHeader && (
        <DingHeader
          balanceType="toman"
          tomanBalance={tomanBalance}
          loading={loading}
          balanceMuted
          showBackButton={showBackButton}
          onBackClick={onBackClick || undefined}
        />
      )}
      {children}
      <EntryBannerModal visibleOnPaths={["/admin/dashboard"]} />
    </>
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
      <ClientAuthGuard>
        <AdminPanelAuthGuard>
          <AdminLayoutContent>{children}</AdminLayoutContent>
        </AdminPanelAuthGuard>
      </ClientAuthGuard>
    </HeaderVisibilityProvider>
  );
}
