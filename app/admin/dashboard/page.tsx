"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  getCachedDashboardData,
  loadDashboardData,
  clearDashboardCache,
  loadDashboardRangeSummary,
} from "@/services/dashboard";
import ShamsiDateInput from "@/components/common/ShamsiDateInput";
import { supabase } from "@/lib/supabaseClient";
import { getCachedAdminPermissions, getCurrentAdminPermissions, clearAdminPermissionsCache } from "@/lib/admin-permissions";
import type { DashboardPeriod, DashboardData } from "@/src/types/dashboard";
import type { AdminPermissions } from "@/src/types/admins";

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
  const [loading, setLoading] = useState(() => getCachedDashboardData() === null);
  const [activePeriod, setActivePeriod] = useState<PeriodTab>("day");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeSummary, setRangeSummary] = useState<{
    ticketsVolume: number;
    ticketsVolumeTotal: number;
    tournamentCommission: number;
    deposits: number;
    withdrawals: number;
  } | null>(null);
  const [permissions, setPermissions] = useState<AdminPermissions | null>(() => getCachedAdminPermissions());
  const [adminZeroId, setAdminZeroId] = useState<string | null>(null);

  useEffect(() => {
    // برای داشبورد هدر را نمایش می‌دهیم و دکمه back لازم نیست
    setShowHeader(true);
    setShowBackButton(false);
    setOnBackClick(null);

    return () => {
      // هنگام خروج از صفحه تنظیمات خاصی لازم نیست
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick]);

  useEffect(() => {
    async function fetchData() {
      try {
        const result = await loadDashboardData({ maxAgeMs: 30_000, force: true });
        setData(result);
        
        // بارگذاری دسترسی‌ها اگر admin است
        if (result?.user?.role === "admin") {
          // Used to hide some menus for non-adminzero admins.
          const { data: adminZero } = await supabase
            .from("users")
            .select("id")
            .eq("username", "adminzero")
            .eq("role", "admin")
            .maybeSingle();
          setAdminZeroId(adminZero?.id ?? null);

          const perms = await getCurrentAdminPermissions({ maxAgeMs: 60_000 });
          setPermissions(perms);
        }
      } catch (error) {
        console.error("Error loading admin dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const summary =
    activePeriod === "range"
      ? rangeSummary
      : data?.summaries[activePeriod];
  const hasReferralCode = Boolean(data?.user?.referralCode);
  const userRole = data?.user?.role;
  const isAdmin = userRole === "admin";
  const adminSubRole = data?.user?.adminSubRole || null;
  const normalizedSubRole = adminSubRole ? adminSubRole.toLowerCase() : null;
  const isAdminZero = isAdmin && !!adminZeroId && data?.user?.id === adminZeroId;
  // مدیر کل (null/manager)، مالی و پشتیبانی می‌توانند گزارش مالی را ببینند
  const canViewFinancialReport =
    isAdmin &&
    (normalizedSubRole === null ||
      normalizedSubRole === "manager" ||
      normalizedSubRole === "finance" ||
      normalizedSubRole === "support");
  
  // بررسی دسترسی‌ها: مدیر کل همه دسترسی‌ها را دارد، سایر مدیران بر اساس permissions
  const canAccessRooms = isAdmin && (permissions?.rooms ?? true);
  const canAccessTournaments = isAdmin;
  const canAccessUsers = isAdmin && (permissions?.users ?? true);
  const canAccessTransactions = isAdmin && (permissions?.transactions ?? true);
  const canAccessEntryBanner = isAdmin && (permissions?.entry_banner ?? true);
  // Only adminzero can see "Admins" and "Card pool" menus.
  const canAccessAdmins = isAdminZero && (permissions?.admins ?? true);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      clearDashboardCache();
      clearAdminPermissionsCache();
      router.push("/login");
    } catch (error) {
      console.error("Error logging out:", error);
    }
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
        tournamentCommission: result.tournamentCommission,
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

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4">
      <div className="max-w-2xl mx-auto">
        {/* کارت اطلاعات کاربر و ردیف کد معرف */}
        <div className="mb-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-sky-500 to-blue-700 flex items-center justify-center text-white text-xl font-bold">
                {data?.user?.displayName?.[0]?.toUpperCase() || "A"}
              </div>
              <div className="flex flex-col">
                <span className="text-white text-lg font-semibold">
                  {data?.user?.displayName || "ادمین"}
                </span>
                <span className="text-gray-300 text-xs">
                  {data?.user?.role === "admin"
                    ? "ادمین"
                    : data?.user?.role === "agent"
                    ? "ایجنت"
                    : data?.user?.role === "super"
                    ? "سوپر"
                    : "کاربر"}
                </span>
                {/* نمایش ID حذف شد؛ فقط نام کاربری/نمایشی باقی می‌ماند */}
              </div>
            </div>
            {/* دکمه خروج */}
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl bg-red-700 text-white text-sm font-semibold hover:bg-red-600 active:bg-red-800 whitespace-nowrap"
            >
              خروج
            </button>
          </div>

          {/* ردیف کد معرف ساده (بدون دراپ‌داون) - برای همه admin ها */}
          {isAdmin && (
            <div className="flex gap-3">
              {/* نمایش کد فعلی */}
              <div className="flex-1">
                <div className="w-full h-12 rounded-xl bg-[#1f1f1f] border border-gray-700 text-gray-100 flex items-center px-4">
                  <span className="text-base font-mono">
                    {data?.user?.referralCode || ""}
                  </span>
                </div>
              </div>

              {/* دکمه ثبت/تغییر کد معرف */}
              <button
                onClick={() => router.push("/admin/settings")}
                className="px-4 h-12 rounded-xl bg-teal-700 text-white text-sm font-semibold shadow-md hover:bg-teal-600 active:bg-teal-800 whitespace-nowrap"
              >
                {hasReferralCode ? "تغییر کد معرف" : "ثبت کد معرف"}
              </button>
            </div>
          )}
        </div>

        {/* تب‌های بازه زمانی و کارت آمار مالی - برای مدیر کل و مدیر مالی */}
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
              {activePeriod === "range" && (!rangeFrom || !rangeTo || rangeFrom > rangeTo) ? (
                <div className="text-center py-4 text-gray-400">بازه تاریخ معتبر انتخاب کنید</div>
              ) : !summary ||
                loading ||
                (activePeriod === "range" && !rangeSummary && !rangeLoading) ? (
                <div className="text-center py-4 text-gray-400">در حال بارگذاری...</div>
              ) : (
                <div className="grid grid-cols-2 gap-y-1">
                  <span>کانیات</span>
                  <span className="text-right font-mono">
                    {summary.ticketsVolume.toLocaleString("en-US")}
                  </span>
                  <span>کانیات کل</span>
                  <span className="text-right font-mono">
                    {summary.ticketsVolumeTotal.toLocaleString("en-US")}
                  </span>
                  <span>کانیات پنل‌ها</span>
                  <span className="text-right font-mono">
                    {Math.max(0, summary.ticketsVolumeTotal - summary.ticketsVolume).toLocaleString("en-US")}
                  </span>
                  <span>کانیات تورنومنت</span>
                  <span className="text-right font-mono">
                    {(summary.tournamentCommission ?? 0).toLocaleString("en-US")}
                  </span>
                  <span>واریز</span>
                  <span className="text-right font-mono">
                    {summary.deposits.toLocaleString("en-US")}
                  </span>
                  <span>برداشت</span>
                  <span className="text-right font-mono">
                    {summary.withdrawals.toLocaleString("en-US")}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* منوهای ناوبری اصلی */}
        <div className="space-y-3">
          {/* منوی "اتاق ها" */}
          {canAccessRooms && (
            <button
              onClick={() => router.push("/admin/room-templates")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>اتاق ها</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {/* منوی "تورنومنت‌ها" */}
          {canAccessTournaments && (
            <button
              onClick={() => router.push("/admin/tournaments")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>تورنومنت‌ها</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {/* منوی "بازی‌ها" */}
          {isAdmin && (
            <button
              onClick={() => router.push("/admin/games")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>بازی‌ها</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {/* منوی "کاربران" */}
          {canAccessUsers && (
            <button
              onClick={() => router.push("/admin/users")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>کاربران</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {/* منوی "تراکنش ها" */}
          {canAccessTransactions && (
            <button
              onClick={() => router.push("/admin/transactions")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>تراکنش ها</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {/* منوی "بنر ورودی" */}
          {canAccessEntryBanner && (
            <button
              onClick={() => router.push("/admin/entry-banner")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>بنر ورودی</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {/* منوی "مدیران" */}
          {canAccessAdmins && (
            <button
              onClick={() => router.push("/admin/admins")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>مدیران</span>
              <span className="text-xl">›</span>
            </button>
          )}
          {/* منوی "استخر کارتها" - فقط برای adminzero */}
          {isAdminZero && (
            <button
              onClick={() => router.push("/admin/card-pool")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1f2933] text-white text-base"
            >
              <span>استخر کارتها</span>
              <span className="text-xl">›</span>
            </button>
          )}

          {/* منوی "حساب کاربری" - آخرین گزینه */}
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

