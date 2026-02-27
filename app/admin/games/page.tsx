"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { loadAdminGamesReport } from "@/services/games-report";
import type { AdminGameReportItem, GamesReportPeriod } from "@/src/types/games-report";
import ShamsiDateInput from "@/components/common/ShamsiDateInput";
import {
  getGlobalRegistrationLockState,
  setGlobalRegistrationLockState,
} from "@/lib/adminApiClient";

type ReportPeriod = GamesReportPeriod;

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  day: "روز",
  week: "هفته",
  month: "ماه",
  range: "بازه",
};

export default function AdminGamesReportPage() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();

  const [activePeriod, setActivePeriod] = useState<ReportPeriod>("day");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeApplied, setRangeApplied] = useState(false);
  const [reports, setReports] = useState<AdminGameReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [globalRegistrationLocked, setGlobalRegistrationLocked] = useState(false);
  const [globalLockReason, setGlobalLockReason] = useState("");
  const [globalLockLoading, setGlobalLockLoading] = useState(true);
  const [globalLockSaving, setGlobalLockSaving] = useState(false);
  const pageSize = 20;

  const canApplyRange = rangeFrom.length > 0 && rangeTo.length > 0 && rangeFrom <= rangeTo;
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.back());

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick, router]);

  useEffect(() => {
    let isMounted = true;

    async function loadGlobalLockState() {
      try {
        setGlobalLockLoading(true);
        const state = await getGlobalRegistrationLockState();
        if (!isMounted) return;
        setGlobalRegistrationLocked(Boolean(state.global_registration_locked));
        setGlobalLockReason(state.global_registration_lock_reason || "");
      } catch (err) {
        if (!isMounted) return;
        setGlobalRegistrationLocked(false);
        setGlobalLockReason("");
      } finally {
        if (isMounted) setGlobalLockLoading(false);
      }
    }

    loadGlobalLockState();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (activePeriod === "range") return;
    let isMounted = true;

    async function fetchByPeriod() {
      try {
        setLoading(true);
        setError(null);
        const result = await loadAdminGamesReport({
          period: activePeriod,
          page,
          pageSize,
          maxAgeMs: 30_000,
        });
        if (!isMounted) return;
        setReports(result.items);
        setTotalCount(result.totalCount);
      } catch (err: any) {
        if (!isMounted) return;
        setError(err?.message || "خطا در دریافت گزارش بازی‌ها");
        setReports([]);
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

    async function fetchRange() {
      try {
        setLoading(true);
        setError(null);
        const result = await loadAdminGamesReport({
          period: "range",
          from: rangeFrom,
          to: rangeTo,
          page,
          pageSize,
          maxAgeMs: 30_000,
        });
        if (!isMounted) return;
        setReports(result.items);
        setTotalCount(result.totalCount);
      } catch (err: any) {
        if (!isMounted) return;
        setError(err?.message || "خطا در دریافت گزارش بازی‌ها");
        setReports([]);
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

  const effectiveReports = useMemo(() => {
    return reports;
  }, [reports]);

  const handleApplyRange = async () => {
    if (!canApplyRange) return;
    setRangeApplied(true);
    setPage(1);
  };

  const handleToggleGlobalLock = async () => {
    try {
      setGlobalLockSaving(true);
      const nextLocked = !globalRegistrationLocked;
      const state = await setGlobalRegistrationLockState(
        nextLocked,
        nextLocked ? globalLockReason : ""
      );
      setGlobalRegistrationLocked(Boolean(state.global_registration_locked));
      setGlobalLockReason(state.global_registration_lock_reason || "");
    } catch (err: any) {
      setError(err?.message || "خطا در تغییر وضعیت قفل ثبت نام");
    } finally {
      setGlobalLockSaving(false);
    }
  };

  const formatPlayedAt = (iso: string) => {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "-";
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4 text-white">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl bg-[#151515] border border-gray-800 mb-4 overflow-hidden">
          <div className="grid grid-cols-4 text-center text-sm font-semibold">
            {(["day", "week", "month", "range"] as ReportPeriod[]).map((period) => (
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

        <div className="rounded-2xl bg-[#151515] border border-gray-800 mb-4 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">قفل سراسری ثبت نام بازی</div>
              <div
                className={`text-xs mt-1 ${
                  globalRegistrationLocked ? "text-amber-300" : "text-emerald-300"
                }`}
              >
                {globalLockLoading
                  ? "در حال بارگذاری وضعیت..."
                  : globalRegistrationLocked
                    ? "ثبت نام همه بازی‌ها قفل است"
                    : "ثبت نام همه بازی‌ها باز است"}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleGlobalLock}
              disabled={globalLockLoading || globalLockSaving}
              className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
                globalRegistrationLocked
                  ? "bg-emerald-600 text-white"
                  : "bg-amber-600 text-white"
              }`}
            >
              {globalLockSaving
                ? "در حال ذخیره..."
                : globalRegistrationLocked
                  ? "باز کردن ثبت نام"
                  : "قفل کردن ثبت نام"}
            </button>
          </div>
          <div className="mt-2">
            <input
              type="text"
              value={globalLockReason}
              onChange={(e) => setGlobalLockReason(e.target.value)}
              placeholder="علت قفل (اختیاری)"
              maxLength={500}
              className="w-full rounded-lg border border-gray-700 bg-[#101214] px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
            />
          </div>
        </div>

        {activePeriod === "range" && (
          <div className="rounded-2xl bg-[#151515] border border-gray-800 mb-4 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <ShamsiDateInput value={rangeFrom} onChange={setRangeFrom} />
              <ShamsiDateInput value={rangeTo} onChange={setRangeTo} />
            </div>
            <button
              onClick={handleApplyRange}
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
          ) : effectiveReports.length === 0 ? (
            <div className="rounded-2xl bg-[#151515] border border-gray-800 p-4 text-center text-gray-400">
              در این بازه، گزارشی برای نمایش وجود ندارد.
            </div>
          ) : (
            effectiveReports.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl bg-[#151515] border border-gray-800 p-4"
              >
                <div className="grid grid-cols-2 gap-y-1 text-sm text-gray-100">
                  <span>بازی</span>
                  <span className="text-right font-medium">
                    {item.roomTitle}
                    {item.roomCode ? ` (${item.roomCode})` : ""}
                  </span>
                  <span>مبلغ میز</span>
                  <span className="text-right font-mono">
                    {item.roomAmount.toLocaleString("en-US")}
                  </span>
                  <span>تعداد تیکت‌ها</span>
                  <span className="text-right font-mono">
                    {item.ticketsCount.toLocaleString("en-US")}
                  </span>
                  <span>درصد کمیسیون میز</span>
                  <span className="text-right font-mono">
                    {item.commissionRatePercent.toLocaleString("en-US")}%
                  </span>
                  <span>زمان بازی</span>
                  <span className="text-right font-mono">{formatPlayedAt(item.playedAt)}</span>
                  <span>برنده های فول</span>
                  <span className="text-right">
                    {item.fullWinnerNames.length > 0
                      ? item.fullWinnerNames.join("، ")
                      : "نامشخص"}
                  </span>
                  <span>برنده‌های لاین</span>
                  <span className="text-right">
                    {item.lineWinnerNames.length > 0
                      ? item.lineWinnerNames.join("، ")
                      : "نامشخص"}
                  </span>
                </div>
                <div className="mt-3 rounded-xl bg-[#101214] border border-gray-700 px-3 py-2 text-sm text-gray-100">
                  <div className="font-semibold mb-1">نتیجه بازی</div>
                  <div className="text-right">پاداش لاین: {item.lineReward.toLocaleString("en-US")}</div>
                  <div className="text-right">پاداش فول: {item.fullReward.toLocaleString("en-US")}</div>
                  <div className="text-right">پاداش کل: {item.totalReward.toLocaleString("en-US")}</div>
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

