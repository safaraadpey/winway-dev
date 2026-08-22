"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  getCachedDashboardData,
  loadDashboardData,
  loadDashboardRangeSummary,
} from "@/services/dashboard";
import { hardExitFromCurrentPanel } from "@/lib/auth/hardExit";
import ShamsiDateInput from "@/components/common/ShamsiDateInput";
import { supabase } from "@/lib/supabaseClient";
import { getCachedAdminPermissions, getCurrentAdminPermissions } from "@/lib/admin-permissions";
import AdminDashboardReportSkeleton from "@/components/admin/AdminDashboardReportSkeleton";
import type { DashboardPeriod, DashboardData } from "@/src/types/dashboard";
import type { AdminPermissions } from "@/src/types/admins";
import InstallAppButton from "@/components/InstallAppButton";
import ReferralRegistrationLink from "@/components/admin/ReferralRegistrationLink";
import PendingWithdrawalAlertBadge from "@/components/admin/PendingWithdrawalAlertBadge";
import { useReferralCodeDashboardSync } from "@/lib/referral/useReferralCodeDashboardSync";

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  day: "روز",
  week: "هفته",
  month: "ماه",
};

export default function AdminDashboardPage() {
  type PeriodTab = DashboardPeriod | "range";
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [data, setData] = useState<DashboardData | null>(() => getCachedDashboardData());
  const [reportLoading, setReportLoading] = useState(() => getCachedDashboardData() === null);
  const [activePeriod, setActivePeriod] = useState<PeriodTab>("day");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeSummary, setRangeSummary] = useState<{
    ticketsVolume: number;
    ticketsVolumeTotal: number;
    tournamentTicketsVolumeTotal: number;
    tournamentCommission: number;
    tournamentGuaranteePayout: number;
    gatewayPurchases: number;
    deposits: number;
    withdrawals: number;
  } | null>(null);
  const [permissions, setPermissions] = useState<AdminPermissions | null>(() =>
    getCachedAdminPermissions()
  );
  const [adminZeroId, setAdminZeroId] = useState<string | null>(null);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(false);
    setOnBackClick(null);
  }, [setShowHeader, setShowBackButton, setOnBackClick]);

  useReferralCodeDashboardSync(setData);

  useEffect(() => {
    let cancelled = false;

    async function loadShellMeta() {
      try {
        const [adminZeroRes, perms] = await Promise.all([
          supabase
            .from("users")
            .select("id")
            .eq("username", "adminzero")
            .eq("role", "admin")
            .maybeSingle(),
          getCurrentAdminPermissions({ maxAgeMs: 60_000 }),
        ]);

        if (cancelled) return;

        setAdminZeroId(adminZeroRes.data?.id ?? null);
        setPermissions(perms);
      } catch (error) {
        console.error("Error loading admin dashboard shell metadata:", error);
      }
    }

    void loadShellMeta();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      try {
        const result = await loadDashboardData({ maxAgeMs: 30_000, force: true });
        if (cancelled) return;
        setData(result);
      } catch (error) {
        console.error("Error loading admin dashboard reports:", error);
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
    activePeriod === "range" ? rangeSummary : data?.summaries[activePeriod];
  const hasReferralCode = Boolean(data?.user?.referralCode);
  const userRole = data?.user?.role;
  const isAdmin = !data?.user || userRole === "admin";
  const adminSubRole = data?.user?.adminSubRole || null;
  const normalizedSubRole = adminSubRole ? adminSubRole.toLowerCase() : null;
  const isAdminZero = isAdmin && !!adminZeroId && data?.user?.id === adminZeroId;
  const canManageReferralCode = isAdminZero;
  const reportAccessResolved = Boolean(data?.user);
  const canViewFinancialReport = reportAccessResolved
    ? isAdmin &&
      (normalizedSubRole === null ||
        normalizedSubRole === "manager" ||
        normalizedSubRole === "finance" ||
        normalizedSubRole === "support")
    : true;

  const canAccessRooms = isAdmin && (permissions?.rooms ?? true);
  const canAccessTournaments = isAdmin;
  const canAccessUsers = isAdmin && (permissions?.users ?? true);
  const canAccessTransactions = isAdmin && (permissions?.transactions ?? true);
  const canAccessEntryBanner = isAdmin && (permissions?.entry_banner ?? true);
  const canAccessAdmins = isAdminZero && (permissions?.admins ?? true);

  const handleLogout = () => {
    hardExitFromCurrentPanel();
  };

  const handleLoadRange = async () => {
    if (!rangeFrom || !rangeTo) return;
    if (rangeFrom > rangeTo) return;
    try {
      setRangeLoading(true);
      const result = await loadDashboardRangeSummary({
        from: rangeFrom,
        to: rangeTo,
      });
      setRangeSummary({
        ticketsVolume: result.ticketsVolume,
        ticketsVolumeTotal: result.ticketsVolumeTotal,
        tournamentTicketsVolumeTotal: result.tournamentTicketsVolumeTotal,
        tournamentCommission: result.tournamentCommission,
        tournamentGuaranteePayout: result.tournamentGuaranteePayout,
        gatewayPurchases: result.gatewayPurchases,
        deposits: result.deposits,
        withdrawals: result.withdrawals,
      });
    } catch (error) {
      console.error("Error loading range dashboard summary:", error);
      setRangeSummary(null);
    } finally {
      setRangeLoading(false);
    }
  };

  const renderReportContent = () => {
    if (activePeriod === "range") {
      if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) {
        return <div className="text-center py-4 text-gray-400">بازه تاریخ معتبر انتخاب کنید</div>;
      }
      if (rangeLoading) {
        return <AdminDashboardReportSkeleton />;
      }
      if (!rangeSummary) {
        return <div className="text-center py-4 text-gray-400">بازه را اعمال کنید</div>;
      }
    } else if (reportLoading || !summary) {
      return <AdminDashboardReportSkeleton />;
    }

    if (!summary) {
      return <div className="text-center py-4 text-gray-400">داده‌ای موجود نیست</div>;
    }

    return (
      <div className="grid grid-cols-2 gap-y-1">
        <span>کانیات کل</span>
        <span className="text-right font-mono">{summary.ticketsVolumeTotal.toLocaleString("en-US")}</span>
        <span>کانیات کل تورنومنت‌ها</span>
        <span className="text-right font-mono">
          {(summary.tournamentTicketsVolumeTotal ?? 0).toLocaleString("en-US")}
        </span>
        <span>کانیات کل بازی‌ها</span>
        <span className="text-right font-mono">
          {Math.max(
            0,
            summary.ticketsVolumeTotal - (summary.tournamentTicketsVolumeTotal ?? 0)
          ).toLocaleString("en-US")}
        </span>
        <span>کانیات پنل‌ها</span>
        <span className="text-right font-mono">
          {Math.max(0, summary.ticketsVolumeTotal - summary.ticketsVolume).toLocaleString("en-US")}
        </span>
        <span>کانیات من</span>
        <span className="text-right font-mono">{summary.ticketsVolume.toLocaleString("en-US")}</span>
        <span>کانیات از تورنومنت</span>
        <span className="text-right font-mono">
          {(summary.tournamentCommission ?? 0).toLocaleString("en-US")}
        </span>
        <span>کانیات از بازی‌ها</span>
        <span className="text-right font-mono">
          {Math.max(0, summary.ticketsVolume - (summary.tournamentCommission ?? 0)).toLocaleString(
            "en-US"
          )}
        </span>
        <span>تاپ آپ گارانتی</span>
        <span className="text-right font-mono">
          {(summary.tournamentGuaranteePayout ?? 0).toLocaleString("en-US")}
        </span>
        <span>خرید از درگاه</span>
        <span className="text-right font-mono">
          {(summary.gatewayPurchases ?? 0).toLocaleString("en-US")}
        </span>
        <span>واریز</span>
        <span className="text-right font-mono">{summary.deposits.toLocaleString("en-US")}</span>
        <span>برداشت</span>
        <span className="text-right font-mono">{summary.withdrawals.toLocaleString("en-US")}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <InstallAppButton label="نصب اپ ادمین" />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-sky-500 to-blue-700 flex items-center justify-center text-white text-xl font-bold">
                {data?.user?.displayName?.[0]?.toUpperCase() || "A"}
              </div>
              <div className="flex flex-col">
                {reportLoading && !data?.user?.displayName ? (
                  <div className="h-5 w-28 rounded bg-gray-800 animate-pulse mb-1" />
                ) : (
                  <span className="text-white text-lg font-semibold">
                    {data?.user?.displayName || "ادمین"}
                  </span>
                )}
                <span className="text-gray-300 text-xs">
                  {data?.user?.role === "admin" || !data?.user
                    ? "ادمین"
                    : data?.user?.role === "agent"
                    ? "ایجنت"
                    : data?.user?.role === "super"
                    ? "سوپر"
                    : "کاربر"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canAccessTransactions && (
                <PendingWithdrawalAlertBadge
                  userRole={userRole}
                  transactionsPath="/admin/transactions?tab=withdrawals"
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

          {canManageReferralCode && (
            <ReferralRegistrationLink
              referralCode={data?.user?.referralCode}
              settingsPath="/admin/settings"
              hasReferralCode={hasReferralCode}
            />
          )}
        </div>

        {canViewFinancialReport && (
          <div className="rounded-2xl bg-[#151515] border border-gray-800 mb-6">
            <div className="grid grid-cols-4 text-center text-sm font-semibold rounded-2xl overflow-hidden">
              {(["day", "week", "month"] as DashboardPeriod[]).map((period) => (
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
              <button
                onClick={() => setActivePeriod("range")}
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
                    disabled={!rangeFrom || !rangeTo || rangeFrom > rangeTo || rangeLoading}
                    className="w-full rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {rangeLoading ? "در حال محاسبه..." : "اعمال بازه"}
                  </button>
                </div>
              )}
              {renderReportContent()}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {canAccessRooms && (
            <button
              onClick={() => router.push("/admin/room-templates")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>اتاق ها</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {canAccessTournaments && (
            <button
              onClick={() => router.push("/admin/tournaments")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>تورنومنت‌ها</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => router.push("/admin/games")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>بازی‌ها</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {canAccessUsers && (
            <button
              onClick={() => router.push("/admin/users")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>کاربران</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {canAccessUsers && (
            <button
              onClick={() => router.push("/admin/kyc")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>احراز هویت</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {canAccessTransactions && (
            <button
              onClick={() => router.push("/admin/transactions")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>تراکنش ها</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => router.push("/admin/crypto-payment")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>مدیریت پرداخت</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {canAccessEntryBanner && (
            <button
              onClick={() => router.push("/admin/entry-banner")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>بنر ورودی</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {canAccessAdmins && (
            <button
              onClick={() => router.push("/admin/admins")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>مدیران</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {isAdminZero && (
            <button
              onClick={() => router.push("/admin/features")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>Feature Management</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {isAdminZero && (
            <button
              onClick={() => router.push("/admin/card-pool")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>استخر کارتها</span>
              <span className="text-xl">›</span>
            </button>
          )}
          <button
            onClick={() => router.push("/admin/account")}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
          >
            <span>حساب کاربری</span>
            <span className="text-xl">›</span>
          </button>
        </div>
      </div>
    </div>
  );
}
