"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  getCachedDashboardData,
  loadDashboardData,
  loadDashboardDaySummary,
  loadDashboardRangeSummary,
} from "@/services/dashboard";
import type { DashboardRangeSummary } from "@/services/dashboard";
import { hardExitFromCurrentPanel } from "@/lib/auth/hardExit";
import type { DashboardPeriod, DashboardData, FinancialSummary } from "@/src/types/dashboard";
import ShamsiDateInput from "@/components/common/ShamsiDateInput";
import ReferralRegistrationLink from "@/components/admin/ReferralRegistrationLink";
import PendingWithdrawalAlertBadge from "@/components/admin/PendingWithdrawalAlertBadge";
import AdminDashboardReportSkeleton from "@/components/admin/AdminDashboardReportSkeleton";
import { useReferralCodeDashboardSync } from "@/lib/referral/useReferralCodeDashboardSync";
import InstallAppButton from "@/components/InstallAppButton";

const PERIOD_LABELS: Partial<Record<DashboardPeriod, string>> = {
  day: "روز",
  week: "هفته",
  overall: "کل",
};

function DashboardAmount({
  value,
  size = "14",
}: {
  value: number;
  size?: "12" | "13" | "14";
}) {
  return (
    <span className={`numeric-text numeric-text--${size}`} dir="ltr">
      {value.toLocaleString("en-US")}
    </span>
  );
}

export default function AgentDashboardPage() {
  type PeriodTab = DashboardPeriod | "range";
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [data, setData] = useState<DashboardData | null>(() => getCachedDashboardData());
  const [reportLoading, setReportLoading] = useState(() => getCachedDashboardData() === null);
  const [activePeriod, setActivePeriod] = useState<PeriodTab>("week");
  const [daySummary, setDaySummary] = useState<FinancialSummary | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeSummary, setRangeSummary] = useState<DashboardRangeSummary | null>(null);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(false);
    setOnBackClick(null);
  }, [setShowHeader, setShowBackButton, setOnBackClick]);

  useReferralCodeDashboardSync(setData);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      try {
        const result = await loadDashboardData({ maxAgeMs: 30_000, force: true });
        if (cancelled) return;
        setData(result);
      } catch (error) {
        console.error("Error loading agent dashboard reports:", error);
      } finally {
        if (!cancelled) {
          setReportLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, []);

  const summary =
    activePeriod === "range"
      ? rangeSummary
      : activePeriod === "day"
      ? daySummary
      : data?.summaries[activePeriod];
  const hasReferralCode = Boolean(data?.user?.referralCode);
  const userRole = data?.user?.role;
  const roleLabel =
    userRole === "super"
      ? "سوپر"
      : userRole === "agent"
      ? "ایجنت"
      : userRole === "admin"
      ? "ادمین"
      : "کاربر";

  const handleLoadDaySummary = async (options?: { force?: boolean }) => {
    if (dayLoading) return;
    try {
      setDayLoading(true);
      const result = await loadDashboardDaySummary({
        maxAgeMs: 30_000,
        force: options?.force,
      });
      setDaySummary(result);
    } catch (error) {
      console.error("Error loading agent dashboard day summary:", error);
      if (!options?.force) {
        setDaySummary(null);
      }
    } finally {
      setDayLoading(false);
    }
  };

  const handlePeriodChange = (period: PeriodTab) => {
    setActivePeriod(period);
    if (period === "day") {
      void handleLoadDaySummary();
    }
  };

  const handleLogout = () => {
    hardExitFromCurrentPanel();
  };

  const handleLoadRange = async () => {
    if (!rangeFrom || !rangeTo) return;
    if (rangeFrom >= rangeTo) return;
    try {
      setRangeLoading(true);
      const result = await loadDashboardRangeSummary({
        from: rangeFrom,
        to: rangeTo,
      });
      setRangeSummary(result);
    } catch (error) {
      console.error("Error loading range dashboard summary:", error);
      setRangeSummary(null);
    } finally {
      setRangeLoading(false);
    }
  };

  const renderReportContent = () => {
    if (activePeriod === "range") {
      if (!rangeFrom || !rangeTo || rangeFrom >= rangeTo) {
        return <div className="text-center py-4 text-gray-400">بازه تاریخ معتبر انتخاب کنید</div>;
      }
      if (rangeLoading) {
        return <AdminDashboardReportSkeleton />;
      }
      if (!rangeSummary) {
        return <div className="text-center py-4 text-gray-400">بازه را اعمال کنید</div>;
      }
    } else if (activePeriod === "day") {
      if (dayLoading && !daySummary) {
        return <AdminDashboardReportSkeleton />;
      }
      if (!daySummary) {
        return <div className="text-center py-4 text-gray-400">در حال بارگذاری...</div>;
      }
    } else if (reportLoading && !summary) {
      return <AdminDashboardReportSkeleton />;
    } else if (!summary) {
      return <div className="text-center py-4 text-gray-400">داده‌ای موجود نیست</div>;
    }

    const report = summary!;

    return (
      <div className="grid grid-cols-2 gap-y-1">
        <span>کانیات من</span>
        <span className="text-right">
          <DashboardAmount value={report.ticketsVolume} />
        </span>
        <span>کانیات کل</span>
        <span className="text-right">
          <DashboardAmount value={report.ticketsVolumeTotal} />
        </span>
        <span>کانیات از تورنومنت</span>
        <span className="text-right">
          <DashboardAmount value={report.tournamentCommission ?? 0} />
        </span>
        <span>کانیات از بازی</span>
        <span className="text-right">
          <DashboardAmount
            value={Math.max(0, report.ticketsVolume - (report.tournamentCommission ?? 0))}
          />
        </span>
        <span>مجموع برد پلیر</span>
        <span className="text-right">
          <DashboardAmount value={report.playerWinnings ?? 0} />
        </span>
        <span>مجموع باخت پلیر</span>
        <span className="text-right">
          <DashboardAmount value={report.playerPurchases ?? 0} />
        </span>
        <span>عملکرد بازی</span>
        <span
          className={`text-right ${
            (report.playerWinnings ?? 0) - (report.playerPurchases ?? 0) >= 0
              ? "text-emerald-400"
              : "text-rose-400"
          }`}
        >
          <DashboardAmount
            value={(report.playerWinnings ?? 0) - (report.playerPurchases ?? 0)}
          />
        </span>
        <span>واریز</span>
        <span className="text-right">
          <DashboardAmount value={report.deposits} />
        </span>
        <span>برداشت</span>
        <span className="text-right">
          <DashboardAmount value={report.withdrawals} />
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <InstallAppButton label="نصب اپ ایجنت" />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-sky-500 to-blue-700 flex items-center justify-center text-white text-xl font-bold">
                {data?.user?.displayName?.[0]?.toUpperCase() || "A"}
              </div>
              <div className="flex flex-col">
                <span className="text-white text-lg font-semibold">
                  {data?.user?.displayName || roleLabel}
                </span>
                <span className="text-gray-300 text-xs">{roleLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(userRole === "agent" || userRole === "super") && (
                <PendingWithdrawalAlertBadge
                  userRole={userRole}
                  transactionsPath="/agent/transactions?tab=withdrawals"
                />
              )}
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-xl bg-red-700 text-white text-sm font-semibold hover:bg-red-600 active:bg-red-800 whitespace-nowrap"
              >
                خروج
              </button>
            </div>
          </div>

          <ReferralRegistrationLink
            referralCode={data?.user?.referralCode}
            settingsPath="/agent/settings"
            hasReferralCode={hasReferralCode}
          />
        </div>

        <div className="rounded-2xl bg-[#151515] border border-gray-800 mb-6">
          <div className="grid grid-cols-4 text-center text-sm font-semibold">
            {(["day", "week", "overall"] as DashboardPeriod[]).map((period) => (
              <button
                key={period}
                onClick={() => handlePeriodChange(period)}
                className={`py-3 ${
                  activePeriod === period ? "bg-teal-500 text-black" : "text-gray-300"
                }`}
              >
                {PERIOD_LABELS[period]}
              </button>
            ))}
            <button
              onClick={() => handlePeriodChange("range")}
              className={`py-3 ${
                activePeriod === "range" ? "bg-teal-500 text-black" : "text-gray-300"
              }`}
            >
              بازه
            </button>
          </div>
          <div className="px-4 py-3 text-sm text-gray-100">
            {activePeriod === "range" && (
              <div className="mb-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <ShamsiDateInput value={rangeFrom} onChange={setRangeFrom} />
                  <ShamsiDateInput value={rangeTo} onChange={setRangeTo} />
                </div>
                <button
                  onClick={handleLoadRange}
                  disabled={!rangeFrom || !rangeTo || rangeFrom >= rangeTo || rangeLoading}
                  className="w-full rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {rangeLoading ? "در حال محاسبه..." : "اعمال بازه"}
                </button>
              </div>
            )}
            {renderReportContent()}
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => router.push("/agent/tournaments/report")}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
          >
            <span>گزارش تورنومنت‌ها</span>
            <span className="text-xl">›</span>
          </button>
          <button
            onClick={() => router.push("/admin/games")}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
          >
            <span>بازی‌ها</span>
            <span className="text-xl">›</span>
          </button>
          <button
            onClick={() => router.push("/agent/users")}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
          >
            <span>کاربران</span>
            <span className="text-xl">›</span>
          </button>
          <button
            onClick={() => router.push("/admin/account")}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
          >
            <span>حساب کاربری</span>
            <span className="text-xl">›</span>
          </button>
          <button
            onClick={() => router.push("/agent/transactions")}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
          >
            <span>تراکنش ها</span>
            <span className="text-xl">›</span>
          </button>
        </div>
      </div>
    </div>
  );
}
