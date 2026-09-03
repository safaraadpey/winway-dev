"use client";

import React from 'react';
import { usePathname } from "next/navigation";
import { HeaderVisibilityProvider, useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import DingHeader from "@/components/DingHeader";
import EntryBannerModal from "@/components/EntryBannerModal";
import ReferralCodeRequiredModal from "@/components/agent/ReferralCodeRequiredModal";
import ClientAuthGuard from "@/components/auth/ClientAuthGuard";

function AgentLayoutContent({
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
            balanceMuted
            showBackButton={showBackButton}
            onBackClick={onBackClick || undefined}
          />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
      <ReferralCodeRequiredModal />
      <EntryBannerModal visibleOnPaths={["/agent/dashboard"]} />
    </div>
  );
}

/**
 * Layout برای بخش ایجنت
 * شامل DingHeader (پیش‌فرض: نمایش) - بدون PlayerStatusBar
 */
export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/agent/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <HeaderVisibilityProvider>
      <ClientAuthGuard blockShell={false} loginPath="/agent/login">
        <AgentLayoutContent>{children}</AgentLayoutContent>
      </ClientAuthGuard>
    </HeaderVisibilityProvider>
  );
}

