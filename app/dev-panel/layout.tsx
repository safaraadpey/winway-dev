"use client";

import React from "react";
import { usePathname } from "next/navigation";
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {showHeader && (
        <div className="flex-shrink-0">
          <DingHeader
            balanceType="toman"
            tomanBalance={tomanBalance}
            loading={loading}
            showBackButton={showBackButton}
            onBackClick={onBackClick || undefined}
          />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

export default function DevPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/dev-panel/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

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
