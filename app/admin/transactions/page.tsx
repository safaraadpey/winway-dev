"use client";

import { Suspense, useEffect } from "react";
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
    <Suspense fallback={<div className="p-4 text-center text-gray-400">در حال بارگذاری...</div>}>
      <TransactionsManager pageTitle="مدیریت تراکنش‌ها" />
    </Suspense>
  );
}


