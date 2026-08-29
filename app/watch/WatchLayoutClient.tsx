"use client";

import React from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import MergedPlayerHeader from "@/components/MergedPlayerHeader";
import { WATCH_GUEST_HEADER_PRESENTATION } from "@/lib/watch-invite/guestHeaderPresentation";

export default function WatchLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { showHeader, showBackButton, onBackClick } = useHeaderVisibility();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
      <div className="sticky top-0 z-50 flex-shrink-0">
        {showHeader && (
          <MergedPlayerHeader
            dingBalance={0}
            tomanBalance={0}
            loading={false}
            showBackButton={showBackButton}
            onBackClick={onBackClick || undefined}
            refreshDisabled
            guestPresentation={WATCH_GUEST_HEADER_PRESENTATION}
          />
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
