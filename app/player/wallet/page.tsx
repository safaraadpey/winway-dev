"use client";

import React, { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";

function WalletPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => {
      window.history.back();
    });
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowBackButton, setOnBackClick]);

  if (action === "buy") {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="mx-auto max-w-[600px]">
          <h1 className="mb-5 text-center text-2xl font-bold text-[var(--player-text-primary,#fff)]">
            خرید
          </h1>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="min-h-[56px] w-full rounded-xl bg-[var(--player-accent,#00d4aa)] px-4 py-4 text-base font-extrabold text-[#0e0e0f] active:scale-[0.98] transition"
              onClick={() => router.push("/player/wallet/buy-rial")}
            >
              خرید ریالی
            </button>
            <button
              type="button"
              className="min-h-[56px] w-full rounded-xl border border-[var(--player-border,rgba(64,64,64,0.8))] bg-[var(--player-surface,rgba(26,26,26,0.75))] px-4 py-4 text-base font-extrabold text-[var(--player-text-primary,#fff)] active:scale-[0.98] transition"
              onClick={() => toast("خرید دلار/تتر به‌زودی فعال می‌شود")}
            >
              خرید دلار/تتر
            </button>
          </div>
        </div>
      </div>
    );
  }

  const title = action === "withdraw" ? "برداشت" : "کیف پول";
  const message =
    action === "withdraw"
      ? "برای برداشت و کش‌اوت با ایجنت خود تماس بگیرید."
      : "این بخش به‌زودی فعال می‌شود.";

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-[600px] text-center">
        <h1 className="mb-3 text-2xl font-bold text-[var(--player-text-primary,#fff)]">
          {title}
        </h1>
        <p className="text-sm leading-7 text-[var(--player-text-muted,#9ca3af)]">
          {message}
        </p>
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-center text-[var(--player-text-muted,#9ca3af)]">
          در حال بارگذاری…
        </div>
      }
    >
      <WalletPageContent />
    </Suspense>
  );
}
