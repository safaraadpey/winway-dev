"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import ShamsiDateInput from "@/components/common/ShamsiDateInput";
import {
  getCachedTournamentReport,
  loadTournamentReport,
} from "@/services/tournaments-report";
import type {
  TournamentReportItem,
  TournamentReportPeriod,
} from "@/src/types/tournaments-report";

type Props = {
  backPath: string;
};

const PERIOD_LABELS: Record<TournamentReportPeriod, string> = {
  day: "روز",
  week: "هفته",
  month: "ماه",
  range: "بازه",
};

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function TournamentsReportPage({ backPath }: Props) {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();

  const [activePeriod, setActivePeriod] = useState<TournamentReportPeriod>("day");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeApplied, setRangeApplied] = useState(false);
  const [items, setItems] = useState<TournamentReportItem[]>([]);
  const [viewerRole, setViewerRole] = useState<"admin" | "agent" | "super">("agent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;
  const cacheMaxAgeMs = 300_000; // 5 minutes

  const canApplyRange = rangeFrom.length > 0 && rangeTo.length > 0 && rangeFrom <= rangeTo;
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push(backPath));

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [backPath, router, setOnBackClick, setShowBackButton, setShowHeader]);

  useEffect(() => {
    if (activePeriod === "range") return;
    let isMounted = true;
    const requestParams = {
      period: activePeriod,
      page,
      pageSize,
      maxAgeMs: cacheMaxAgeMs,
    } as const;

    const cached = getCachedTournamentReport(requestParams);
    if (cached) {
      setItems(cached.items);
      setTotalCount(cached.totalCount);
      setViewerRole(cached.viewerRole);
      setLoading(false);
      setError(null);
      return () => {
        isMounted = false;
      };
    }

    async function fetchByPeriod() {
      try {
        setLoading(true);
        setError(null);
        const result = await loadTournamentReport(requestParams);
        if (!isMounted) return;
        setItems(result.items);
        setTotalCount(result.totalCount);
        setViewerRole(result.viewerRole);
      } catch (err: any) {
        if (!isMounted) return;
        setError(err?.message || "خطا در دریافت گزارش تورنومنت‌ها");
        setItems([]);
        setTotalCount(0);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchByPeriod();
    return () => {
      isMounted = false;
    };
  }, [activePeriod, page]);

  useEffect(() => {
    if (activePeriod !== "range" || !rangeApplied || !canApplyRange) return;
    let isMounted = true;
    const requestParams = {
      period: "range" as const,
      from: rangeFrom,
      to: rangeTo,
      page,
      pageSize,
      maxAgeMs: cacheMaxAgeMs,
    };

    const cached = getCachedTournamentReport(requestParams);
    if (cached) {
      setItems(cached.items);
      setTotalCount(cached.totalCount);
      setViewerRole(cached.viewerRole);
      setLoading(false);
      setError(null);
      return () => {
        isMounted = false;
      };
    }

    async function fetchRange() {
      try {
        setLoading(true);
        setError(null);
        const result = await loadTournamentReport(requestParams);
        if (!isMounted) return;
        setItems(result.items);
        setTotalCount(result.totalCount);
        setViewerRole(result.viewerRole);
      } catch (err: any) {
        if (!isMounted) return;
        setError(err?.message || "خطا در دریافت گزارش تورنومنت‌ها");
        setItems([]);
        setTotalCount(0);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchRange();
    return () => {
      isMounted = false;
    };
  }, [activePeriod, rangeApplied, canApplyRange, rangeFrom, rangeTo, page]);

  const myCommissionLabel = useMemo(() => {
    if (viewerRole === "admin") return "کمیسیون ادمین";
    if (viewerRole === "super") return "کمیسیون من (سوپر)";
    return "کمیسیون من (ایجنت)";
  }, [viewerRole]);

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4 text-white">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl bg-[#151515] border border-gray-800 mb-4 overflow-hidden">
          <div className="grid grid-cols-4 text-center text-sm font-semibold">
            {(["day", "week", "month", "range"] as TournamentReportPeriod[]).map((period) => (
              <button
                key={period}
                onClick={() => setActivePeriod(period)}
                className={`py-3 ${
                  activePeriod === period ? "bg-teal-500 text-black" : "text-gray-300"
                }`}
              >
                {PERIOD_LABELS[period]}
              </button>
            ))}
          </div>
        </div>

        {activePeriod === "range" && (
          <div className="rounded-2xl bg-[#151515] border border-gray-800 mb-4 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <ShamsiDateInput value={rangeFrom} onChange={setRangeFrom} />
              <ShamsiDateInput value={rangeTo} onChange={setRangeTo} />
            </div>
            <button
              onClick={() => {
                if (!canApplyRange) return;
                setRangeApplied(true);
                setPage(1);
              }}
              disabled={!canApplyRange}
              className="w-full rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              اعمال بازه
            </button>
          </div>
        )}

        <div className="space-y-3">
          {error ? (
            <div className="rounded-2xl bg-[#151515] border border-gray-800 p-4 text-center text-red-300">
              {error}
            </div>
          ) : loading ? (
            <div className="rounded-2xl bg-[#151515] border border-gray-800 p-4 text-center text-gray-400">
              در حال بارگذاری...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl bg-[#151515] border border-gray-800 p-4 text-center text-gray-400">
              در این بازه، تورنومنت پایان‌یافته‌ای برای نمایش وجود ندارد.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl bg-[#151515] border border-gray-800 p-4"
              >
                <div className="mb-2">
                  <div className="text-base font-semibold">{item.title}</div>
                  <div className="text-xs text-gray-400">
                    شروع: {formatDateTime(item.startAt)} | پایان: {formatDateTime(item.finishedAt)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-y-1 text-sm text-gray-100">
                  <span>قیمت بلیت</span>
                  <span className="text-right font-mono">{item.ticketPrice.toLocaleString("en-US")}</span>
                  <span>جایزه گارانتی</span>
                  <span className="text-right font-mono">{item.guaranteedPrize.toLocaleString("en-US")}</span>
                  <span>تعداد ثبت‌نام</span>
                  <span className="text-right font-mono">{item.entriesCount.toLocaleString("en-US")}</span>
                  <span>تعداد بلیت</span>
                  <span className="text-right font-mono">{item.ticketsCount.toLocaleString("en-US")}</span>
                  <span>مبلغ ورودی‌ها</span>
                  <span className="text-right font-mono">{item.entriesAmount.toLocaleString("en-US")}</span>
                  <span>پایه کمیسیون</span>
                  <span className="text-right font-mono">{item.commissionBase.toLocaleString("en-US")}</span>
                  <span>{myCommissionLabel}</span>
                  <span className="text-right font-mono">{item.myCommission.toLocaleString("en-US")}</span>
                  <span>استخر جایزه</span>
                  <span className="text-right font-mono">{item.poolAmount.toLocaleString("en-US")}</span>
                  <span>جوایز پرداخت‌شده</span>
                  <span className="text-right font-mono">{item.prizePaid.toLocaleString("en-US")}</span>
                  <span>تاپ آپ گارانتی</span>
                  <span className="text-right font-mono">{item.guaranteeTopup.toLocaleString("en-US")}</span>
                  <span>برنده‌ها</span>
                  <span className="text-right">
                    {item.winnerNames.length > 0 ? item.winnerNames.join("، ") : "نامشخص"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="rounded-lg bg-[#1f2933] px-3 py-2 text-sm disabled:opacity-50"
          >
            قبلی
          </button>
          <div className="text-sm text-gray-300">
            صفحه {page.toLocaleString("en-US")} از {totalPages.toLocaleString("en-US")}
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="rounded-lg bg-[#1f2933] px-3 py-2 text-sm disabled:opacity-50"
          >
            بعدی
          </button>
        </div>
      </div>
    </div>
  );
}
