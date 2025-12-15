"use client";

import { useEffect } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import TransactionsManager from "@/components/admin/TransactionsManager";

export default function AdminTransactionsPage() {
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => history.back());

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick]);

  return (
    <TransactionsManager pageTitle="مدیریت تراکنش‌ها" />
  );
}


