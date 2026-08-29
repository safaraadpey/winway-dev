"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadPendingWithdrawalAlertSummary } from "@/services/withdrawals";
import { canReviewRialWithdrawals } from "@/lib/withdrawal/constants";

const POLL_INTERVAL_MS = 60_000;

interface PendingWithdrawalAlertBadgeProps {
  transactionsPath: string;
  userRole?: string | null;
}

export default function PendingWithdrawalAlertBadge({
  transactionsPath,
  userRole,
}: PendingWithdrawalAlertBadgeProps) {
  const router = useRouter();
  const [counts, setCounts] = useState<{ total: number; rial: number; crypto: number } | null>(
    null
  );

  const canShowBadge = canReviewRialWithdrawals(userRole);

  const refresh = useCallback(async () => {
    if (!canShowBadge) {
      setCounts(null);
      return;
    }

    try {
      const summary = await loadPendingWithdrawalAlertSummary(userRole!);
      setCounts(summary);
    } catch (err) {
      console.error("[Withdrawal] dashboard alert badge load failed:", err);
    }
  }, [canShowBadge, userRole]);

  useEffect(() => {
    if (!canShowBadge) return;

    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [canShowBadge, refresh]);

  const targetHref = useMemo(() => {
    if (!counts || counts.total <= 0) return transactionsPath;

    const params = new URLSearchParams();
    params.set("tab", "withdrawals");

    if (userRole === "admin") {
      if (counts.rial > 0 && counts.crypto === 0) {
        params.set("kind", "rial");
      } else if (counts.crypto > 0 && counts.rial === 0) {
        params.set("kind", "crypto");
      }
    }

    const basePath = transactionsPath.split("?")[0];
    return `${basePath}?${params.toString()}`;
  }, [counts, transactionsPath, userRole]);

  if (!canShowBadge || !counts || counts.total <= 0) {
    return null;
  }

  const displayCount = counts.total > 99 ? "99+" : String(counts.total);

  return (
    <button
      type="button"
      onClick={() => router.push(targetHref)}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/60 bg-amber-600/20 text-amber-300 transition hover:bg-amber-600/30 active:bg-amber-600/40"
      aria-label={`${counts.total.toLocaleString("en-US")} درخواست برداشت در انتظار بررسی`}
      title="برداشت‌های در انتظار بررسی"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.25 9a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.157 2.25 5.657a.75.75 0 0 1-.75 1.25H3.75a.75.75 0 0 1-.75-1.25A8.25 8.25 0 0 0 5.25 9.75V9Zm4.502 8.25a2.25 2.25 0 1 0 4.496 0 .75.75 0 0 1 1.5 0 3.75 3.75 0 1 1-7.496 0 .75.75 0 0 1 1.5 0Z"
          clipRule="evenodd"
        />
      </svg>
      <span
        className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-white numeric-text numeric-text--11"
        dir="ltr"
      >
        {displayCount}
      </span>
    </button>
  );
}
