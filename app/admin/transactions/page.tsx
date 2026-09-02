"use client";

import { Suspense, useEffect } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import TransactionsManager from "@/components/admin/TransactionsManager";
import TransactionsTabSkeleton from "@/components/admin/TransactionsTabSkeleton";

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
    <Suspense fallback={<TransactionsTabSkeleton />}>
      <TransactionsManager pageTitle="مدیریت تراکنش‌ها" />
    </Suspense>
  );
}
