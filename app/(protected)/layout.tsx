"use client";

import "./layout.css";
import { HeaderVisibilityProvider, useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import DingHeader from "@/components/DingHeader";
import ClientAuthGuard from "@/components/auth/ClientAuthGuard";

function ProtectedLayoutContent({
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

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HeaderVisibilityProvider>
      <ClientAuthGuard>
        <ProtectedLayoutContent>{children}</ProtectedLayoutContent>
      </ClientAuthGuard>
    </HeaderVisibilityProvider>
  );
}

