"use client";

import React from "react";
import { BalancesProvider } from "@/lib/contexts/BalancesContext";

export default function GlobalUserStateClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BalancesProvider>{children}</BalancesProvider>;
}


