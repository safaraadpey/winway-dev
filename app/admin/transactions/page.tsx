"use client";

import { Suspense, useEffect } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import TransactionsManager from "@/components/admin/TransactionsManager";

function TransactionsTabSkeleton() {
  return (
    <div className="h-screen bg-[#0E0E0F] text-white flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="max-w-md mx-auto w-full h-full flex flex-col overflow-hidden">
          <div className="flex-shrink-0 p-4 pb-0">
            <div
              className="flex mb-4 rounded-2xl overflow-hidden bg-[#111827] text-sm font-semibold"
              aria-hidden="true"
            >
              {["سوابق", "پیشخوان", "برداشت"].map((label) => (
                <div
                  key={label}
                  className="flex-1 py-3 text-center text-gray-500 animate-pulse"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
