"use client";

/**
 * ActiveGamesOrchestratorProvider (Shadow Mode)
 *
 * این Provider فقط orchestrator را mount می‌کند و هیچ داده‌ای به UI تزریق نمی‌کند.
 * هدف: اثبات lifecycle سالم (بدون leak) در dev/StrictMode.
 */

import React, { type ReactNode, useEffect, useRef } from "react";
import { getActiveGamesOrchestrator } from "@/lib/activeGames/ActiveGamesOrchestrator";
import { useSession } from "@/lib/contexts/SessionContext";

export function ActiveGamesOrchestratorProvider({ children }: { children: ReactNode }) {
  const orchestratorRef = useRef<ReturnType<typeof getActiveGamesOrchestrator> | null>(null);
  const session = useSession();

  useEffect(() => {
    if (!orchestratorRef.current) {
      orchestratorRef.current = getActiveGamesOrchestrator();
    }

    orchestratorRef.current.setEnabled(true, "provider-mount");

    return () => {
      orchestratorRef.current?.setEnabled(false, "provider-unmount");
    };
  }, []);

  useEffect(() => {
    if (!orchestratorRef.current) return;
    orchestratorRef.current.setAuthContext(session);
  }, [session.userId, session.accessToken, session.authReady, session.tokenVersion]);

  return <>{children}</>;
}


