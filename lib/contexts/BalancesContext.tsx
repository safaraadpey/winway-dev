"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import { useBalances, type Balances } from "@/lib/hooks/useBalances";

const BalancesContext = createContext<Balances | null>(null);

export function BalancesProvider({ children }: { children: ReactNode }) {
  // Single source of truth for user balances; room_level live Ding is ledger-only until settlement.
  const balances = useBalances();
  return (
    <BalancesContext.Provider value={balances}>
      {children}
    </BalancesContext.Provider>
  );
}

export function useBalancesContext(): Balances {
  const ctx = useContext(BalancesContext);
  if (!ctx) {
    throw new Error("useBalancesContext must be used within a BalancesProvider");
  }
  return ctx;
}

export function useBalancesContextOptional(): Balances | null {
  return useContext(BalancesContext);
}


