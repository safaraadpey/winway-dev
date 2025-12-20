"use client";

import React from "react";
import { BalancesProvider } from "@/lib/contexts/BalancesContext";
import { SessionProvider } from "@/lib/contexts/SessionContext";

export default function GlobalUserStateClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <BalancesProvider>{children}</BalancesProvider>
    </SessionProvider>
  );
}


