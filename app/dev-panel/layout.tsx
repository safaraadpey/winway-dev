"use client";

import React from "react";
import { HeaderVisibilityProvider, useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import DingHeader from "@/components/DingHeader";
import ClientAuthGuard from "@/components/auth/ClientAuthGuard";
import DevPanelAuthGuard from "@/components/auth/DevPanelAuthGuard";

function DevPanelLayoutContent({
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
    </>
  );
}

export default function DevPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HeaderVisibilityProvider>
      <ClientAuthGuard>
        <DevPanelAuthGuard>
          <DevPanelLayoutContent>{children}</DevPanelLayoutContent>
        </DevPanelAuthGuard>
      </ClientAuthGuard>
    </HeaderVisibilityProvider>
  );
}
