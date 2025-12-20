"use client";

/**
 * ActiveGamesOrchestratorProvider (Shadow Mode)
 *
 * این Provider فقط orchestrator را mount می‌کند و هیچ داده‌ای به UI تزریق نمی‌کند.
 * هدف: اثبات lifecycle سالم (بدون leak) در dev/StrictMode.
 */

import React, { type ReactNode, useEffect, useRef } from "react";
import { getActiveGamesOrchestrator } from "@/lib/activeGames/ActiveGamesOrchestrator";

export function ActiveGamesOrchestratorProvider({ children }: { children: ReactNode }) {
  const orchestratorRef = useRef<ReturnType<typeof getActiveGamesOrchestrator> | null>(null);

  useEffect(() => {
    if (!orchestratorRef.current) {
      orchestratorRef.current = getActiveGamesOrchestrator();
    }

    orchestratorRef.current.start();

    return () => {
      orchestratorRef.current?.stop();
    };
  }, []);

  return <>{children}</>;
}


