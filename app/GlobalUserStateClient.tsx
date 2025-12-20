"use client";

import React from "react";
import { BalancesProvider } from "@/lib/contexts/BalancesContext";
import { SessionProvider } from "@/lib/contexts/SessionContext";
import GameEndResultsListener from "@/components/GameEndResultsListener";

export default function GlobalUserStateClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <BalancesProvider>
        {children}
        <GameEndResultsListener />
      </BalancesProvider>
    </SessionProvider>
  );
}


