"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { loadDevPlayerFinanceReport } from "@/services/dev-panel/dev-player-finance";
import type {
  DevPlayerFinancePeriod,
  DevPlayerFinanceSummary,
} from "@/src/types/dev-player-finance";

const PERIOD_TABS: DevPlayerFinancePeriod[] = ["day", "week", "month"];

function formatAmount(value: number, currency: string): string {
  const suffix = currency === "IRR" ? " تومان" : ` ${currency}`;
  return `${value.toLocaleString("en-US")}${suffix}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "win" | "loss" | "purchase" | "commission";
}) {
  const toneClass =
    tone === "win"
      ? "text-emerald-400"
      : tone === "loss"
        ? "text-rose-400"
        : tone === "purchase"
          ? "text-amber-300"
          : tone === "commission"
            ? "text-sky-400"
            : "text-white";

  return (
    <div className="rounded-xl border border-gray-700/80 bg-[#151515] p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`mt-2 text-lg font-semibold ${toneClass}`} dir="ltr">
        {value}
      </div>
    </div>
  );
}

export default function DevPlayerFinanceReport() {
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<DevPlayerFinanceSummary[]>([]);
  const [activePeriod, setActivePeriod] = useState<DevPlayerFinancePeriod>("day");

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/dev-panel/dashboard"));
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setOnBackClick, setShowBackButton]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadDevPlayerFinanceReport();
      setSummaries(result.summaries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در دریافت گزارش");
      setSummaries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const activeSummary =
    summaries.find((item) => item.period === activePeriod) ?? null;

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-white">گزارش مالی Dev Player</h1>
          <p className="mt-1 text-sm text-gray-400">
            مجموع خرید، تعداد کارت، برد و باخت کاربران تعریف‌شده در dev_player_configs
          </p>
        </div>

        <div className="mb-4 flex gap-2">
          {PERIOD_TABS.map((period) => {
            const label =
              summaries.find((item) => item.period === period)?.periodLabel ??
              (period === "day" ? "روزانه" : period === "week" ? "هفتگی" : "ماهانه");
            const isActive = activePeriod === period;
            return (
              <button
                key={period}
                type="button"
                onClick={() => setActivePeriod(period)}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                  isActive
                    ? "bg-violet-700 text-white"
                    : "bg-[#1f2933] text-gray-300 hover:bg-[#273340]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            {activeSummary
              ? `بازه: ${new Date(activeSummary.from).toLocaleString("fa-IR")} تا ${new Date(activeSummary.to).toLocaleString("fa-IR")}`
              : "—"}
          </div>
          <button
            type="button"
            onClick={() => void fetchReport()}
            disabled={loading}
            className="rounded-lg bg-[#1f2933] px-3 py-1.5 text-xs text-white hover:bg-[#273340] disabled:opacity-60"
          >
            بروزرسانی
          </button>
        </div>

        {loading && (
          <div className="rounded-xl border border-gray-700/80 bg-[#151515] p-6 text-center text-sm text-gray-400">
            در حال بارگذاری...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-rose-900/60 bg-rose-950/20 p-4 text-sm text-rose-300">
            {error}
          </div>
        )}

        {!loading && !error && activeSummary && (
          <>
            <div className="mb-3 text-xs text-violet-300">
              تعداد Dev Player ثبت‌شده: {formatCount(activeSummary.devPlayerCount)}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="مجموع خرید"
                value={formatAmount(
                  activeSummary.totalPurchaseAmount,
                  activeSummary.currency
                )}
                tone="purchase"
              />
              <MetricCard
                label="تعداد کارت خریداری‌شده"
                value={formatCount(activeSummary.cardsPurchased)}
              />
              <MetricCard
                label="مجموع برد"
                value={formatAmount(activeSummary.totalWinAmount, activeSummary.currency)}
                tone="win"
              />
              <MetricCard
                label="مجموع کمیسیون"
                value={formatAmount(
                  activeSummary.totalCommissionAmount,
                  activeSummary.currency
                )}
                tone="commission"
              />
              <MetricCard
                label="مجموع باخت"
                value={formatAmount(activeSummary.totalLossAmount, activeSummary.currency)}
                tone="loss"
              />
            </div>

            <p className="mt-4 text-xs leading-6 text-gray-500">
              خرید و کارت از بلیت‌های consumed/confirmed محاسبه می‌شود. برد از تراکنش‌های
              win، کمیسیون از commission_base در commissions_log و باخت برابر خرید منهای برد
              (حداقل صفر) است؛ بخشی از باخت همان کمیسیون سهم پلتفرم/ایجنت است.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
