// services/dashboard.ts
//
// Service helpers for admin/agent dashboards.
// فعلاً منطق مالی را ساده نگه می‌داریم و فقط اسکلت را می‌سازیم تا بعداً با کوئری‌های دقیق‌تر جایگزین شود.

import { supabase } from "@/lib/supabaseClient";
import { callAdminApi } from "@/lib/adminApiClient";
import { sumGatewayPurchasesInRange } from "@/lib/dashboard/gatewayPurchases";
import {
  getRollingWeekStart,
  getRollingMonthStart,
  loadCommissionDailyStatRows,
  sumCommissionDailyRows,
  type CommissionDailyStatRow,
  type CommissionOperatorRole,
} from "@/lib/dashboard/loadCommissionDailyStats";
import type {
  DashboardData,
  DashboardPanelOperator,
  DashboardPeriod,
  DashboardUserInfo,
  FinancialSummary,
} from "@/src/types/dashboard";

export interface DashboardRangeSummary {
  ticketsVolume: number;
  ticketsVolumeTotal: number;
  tournamentTicketsVolumeTotal: number;
  tournamentCommission: number;
  tournamentGuaranteePayout: number;
  gatewayPurchases: number;
  deposits: number;
  withdrawals: number;
  net: number;
  panelOperators?: DashboardPanelOperator[];
}

// helper: تبدیل UUID به یک رشته عددی ۱۰ رقمی پایدار
function makeShortIdFromUuid(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(31, hash) + id.charCodeAt(i);
  }
  // تبدیل به عدد بدون علامت و محدود کردن به ۱۰ رقم
  const num = (hash >>> 0) % 1_000_000_0000; // 10^10
  return num.toString().padStart(10, "0");
}

const DEFAULT_SUMMARIES: Record<DashboardPeriod, FinancialSummary> = {
  day: {
    period: "day",
    ticketsVolume: 0,
    ticketsVolumeTotal: 0,
    tournamentTicketsVolumeTotal: 0,
    tournamentCommission: 0,
    tournamentGuaranteePayout: 0,
    gatewayPurchases: 0,
    deposits: 0,
    withdrawals: 0,
    net: 0,
  },
  week: {
    period: "week",
    ticketsVolume: 0,
    ticketsVolumeTotal: 0,
    tournamentTicketsVolumeTotal: 0,
    tournamentCommission: 0,
    tournamentGuaranteePayout: 0,
    gatewayPurchases: 0,
    deposits: 0,
    withdrawals: 0,
    net: 0,
  },
  month: {
    period: "month",
    ticketsVolume: 0,
    ticketsVolumeTotal: 0,
    tournamentTicketsVolumeTotal: 0,
    tournamentCommission: 0,
    tournamentGuaranteePayout: 0,
    gatewayPurchases: 0,
    deposits: 0,
    withdrawals: 0,
    net: 0,
  },
  overall: {
    period: "overall",
    ticketsVolume: 0,
    ticketsVolumeTotal: 0,
    tournamentTicketsVolumeTotal: 0,
    tournamentCommission: 0,
    tournamentGuaranteePayout: 0,
    gatewayPurchases: 0,
    deposits: 0,
    withdrawals: 0,
    net: 0,
  },
};

type DashboardCache = {
  key: string;
  fetchedAtMs: number;
  data: DashboardData;
};

let dashboardCache: DashboardCache | null = null;

function isAdminPanelRoute(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
}

async function loadDashboardDataFromAdminSnapshot(options?: {
  maxAgeMs?: number;
  force?: boolean;
}): Promise<DashboardData> {
  const maxAgeMs = options?.maxAgeMs ?? 30_000;
  const cacheKey = "admin-snapshot|v2";

  if (!options?.force && dashboardCache?.key === cacheKey) {
    const ageMs = Date.now() - dashboardCache.fetchedAtMs;
    if (ageMs >= 0 && ageMs <= maxAgeMs) {
      return dashboardCache.data;
    }
  }

  const data = await callAdminApi<DashboardData>("/api/admin/dashboard/snapshot", {
    method: "GET",
  });

  dashboardCache = {
    key: cacheKey,
    fetchedAtMs: Date.now(),
    data,
  };

  return data;
}

export function getCachedDashboardData(): DashboardData | null {
  return dashboardCache?.data ?? null;
}

export function clearDashboardCache() {
  dashboardCache = null;
}

async function fetchAdminCommissionSummary(): Promise<{
  effectiveUserId: string;
  day: number;
  week: number;
  month: number;
  dayTotal: number;
  weekTotal: number;
  monthTotal: number;
  dayTournamentTotal: number;
  weekTournamentTotal: number;
  monthTournamentTotal: number;
  dayTournament: number;
  weekTournament: number;
  monthTournament: number;
}> {
  const { data, error } = await supabase.rpc("fn_dashboard_admin_commission_summary");
  if (error) {
    throw new Error(error.message || "Failed to load admin commission summary");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Empty admin commission summary");
  }

  return {
    effectiveUserId: String((row as any).effective_user_id || ""),
    day: Number((row as any).day_amount || 0),
    week: Number((row as any).week_amount || 0),
    month: Number((row as any).month_amount || 0),
    dayTotal: Number((row as any).day_total || 0),
    weekTotal: Number((row as any).week_total || 0),
    monthTotal: Number((row as any).month_total || 0),
    dayTournamentTotal: Number((row as any).day_tournament_total || 0),
    weekTournamentTotal: Number((row as any).week_tournament_total || 0),
    monthTournamentTotal: Number((row as any).month_tournament_total || 0),
    dayTournament: Number((row as any).day_tournament_amount || 0),
    weekTournament: Number((row as any).week_tournament_amount || 0),
    monthTournament: Number((row as any).month_tournament_amount || 0),
  };
}

async function fetchAdminCommissionSummaryRange(
  fromIso: string,
  toIso: string
): Promise<{
  effectiveUserId: string;
  amount: number;
  total: number;
  tournamentAmount: number;
  tournamentTotal: number;
}> {
  const { data, error } = await supabase.rpc("fn_dashboard_admin_commission_summary_range", {
    p_from: fromIso,
    p_to: toIso,
  });
  if (error) {
    throw new Error(error.message || "Failed to load admin commission range");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Empty admin commission range");
  }
  return {
    effectiveUserId: String((row as any).effective_user_id || ""),
    amount: Number((row as any).amount || 0),
    total: Number((row as any).total || 0),
    tournamentAmount: Number((row as any).tournament_amount || 0),
    tournamentTotal: Number((row as any).tournament_total || 0),
  };
}

async function fetchAdminGuaranteeSummary(): Promise<{
  effectiveUserId: string;
  day: number;
  week: number;
  month: number;
}> {
  const { data, error } = await supabase.rpc("fn_dashboard_admin_tournament_guarantee_summary");
  if (error) {
    throw new Error(error.message || "Failed to load admin tournament guarantee summary");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Empty admin tournament guarantee summary");
  }
  return {
    effectiveUserId: String((row as any).effective_user_id || ""),
    day: Number((row as any).day_amount || 0),
    week: Number((row as any).week_amount || 0),
    month: Number((row as any).month_amount || 0),
  };
}

async function fetchAdminGuaranteeSummaryRange(
  fromIso: string,
  toIso: string
): Promise<{ effectiveUserId: string; amount: number }> {
  const { data, error } = await supabase.rpc(
    "fn_dashboard_admin_tournament_guarantee_summary_range",
    {
      p_from: fromIso,
      p_to: toIso,
    }
  );
  if (error) {
    throw new Error(error.message || "Failed to load admin tournament guarantee range");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Empty admin tournament guarantee range");
  }
  return {
    effectiveUserId: String((row as any).effective_user_id || ""),
    amount: Number((row as any).amount || 0),
  };
}

export async function loadDashboardRangeSummary(params: {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}): Promise<DashboardRangeSummary> {
  const user = await loadDashboardUserInfo();
  if (!user) {
    return {
      ticketsVolume: 0,
      ticketsVolumeTotal: 0,
      tournamentTicketsVolumeTotal: 0,
      tournamentCommission: 0,
      tournamentGuaranteePayout: 0,
      gatewayPurchases: 0,
      deposits: 0,
      withdrawals: 0,
      net: 0,
      panelOperators: [],
    };
  }

  // تفسیر تاریخ‌ها به عنوان UTC (نه زمان محلی)
  const from = new Date(`${params.from}T00:00:00.000Z`);
  const to = new Date(`${params.to}T23:59:59.999Z`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
    throw new Error("بازه تاریخ نامعتبر است");
  }

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const manualPanelQuery = supabase
    .from("transactions")
    .select("amount, type")
    .eq("source_kind", "manual_panel")
    .eq("source_ref", user.id)
    .in("type", ["deposit", "withdraw"])
    .gte("created_at", fromIso)
    .lte("created_at", toIso);

  const transferQuery = supabase
    .from("transactions")
    .select("amount, meta")
    .eq("source_kind", "admin_panel_transfer")
    .eq("type", "transfer_out")
    .filter("meta->>actor_id", "eq", user.id)
    .gte("created_at", fromIso)
    .lte("created_at", toIso);

  const commissionQuery =
    user.role === "admin"
      ? null
      : loadCommissionDailyStatRows({
          supabase,
          userId: user.id,
          role: operatorRoleForUser(user.role)!,
          fromDate: params.from,
          toDate: params.to,
        }).then((rows) => ({ data: rows, error: null }));

  const [manualRes, transferRes, commissionRes] = await Promise.all([
    manualPanelQuery,
    transferQuery,
    commissionQuery ? commissionQuery : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (manualRes.error) throw new Error("خطا در دریافت واریز/برداشت");
  if (transferRes.error) throw new Error("خطا در دریافت تراکنش‌های پنلی");
  if ((commissionRes as any).error) throw new Error("خطا در دریافت کمیسیون");

  const manualRows = manualRes.data || [];
  const transferRows = transferRes.data || [];
  const commissionRows = ((commissionRes as any).data || []) as CommissionDailyStatRow[];

  const deposits =
    manualRows.reduce(
      (sum: number, t: any) => sum + (String(t.type) === "deposit" ? Number(t.amount || 0) : 0),
      0
    ) +
    transferRows.reduce(
      (sum: number, t: any) =>
        sum + (String((t.meta as any)?.action ?? "") === "deposit" ? Number(t.amount || 0) : 0),
      0
    );

  const withdrawals =
    manualRows.reduce(
      (sum: number, t: any) => sum + (String(t.type) === "withdraw" ? Number(t.amount || 0) : 0),
      0
    ) +
    transferRows.reduce(
      (sum: number, t: any) =>
        sum + (String((t.meta as any)?.action ?? "") === "withdraw" ? Number(t.amount || 0) : 0),
      0
    );

  if (user.role === "admin") {
    const [admin, guarantee, gatewayDepositRes] = await Promise.all([
      fetchAdminCommissionSummaryRange(fromIso, toIso),
      fetchAdminGuaranteeSummaryRange(fromIso, toIso),
      supabase
        .from("transactions")
        .select("amount, created_at, idempotency_key")
        .eq("source_kind", "deposit_domain")
        .eq("type", "deposit")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
    ]);

    if (gatewayDepositRes.error) {
      console.error("[Dashboard] deposit_domain gateway range error:", gatewayDepositRes.error);
    }

    const gatewayPurchases = sumGatewayPurchasesInRange(
      gatewayDepositRes.data || [],
      fromIso,
      toIso
    );

    let panelOperators: DashboardPanelOperator[] = [];
    if (isAdminPanelRoute()) {
      try {
        panelOperators = await callAdminApi<DashboardPanelOperator[]>(
          `/api/admin/dashboard/panel-operators?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`,
          { method: "GET" }
        );
        if (!Array.isArray(panelOperators)) {
          panelOperators = [];
        }
      } catch (error) {
        console.error("[Dashboard] panel-operators range error:", error);
        panelOperators = [];
      }
    }

    return {
      ticketsVolume: admin.amount,
      ticketsVolumeTotal: admin.total,
      tournamentTicketsVolumeTotal: admin.tournamentTotal,
      tournamentCommission: admin.tournamentAmount,
      tournamentGuaranteePayout: guarantee.amount,
      gatewayPurchases,
      deposits,
      withdrawals,
      net: deposits - withdrawals,
      panelOperators,
    };
  }

  const commissionTotals = commissionTotalsFromDailyRows(
    commissionRows,
    params.from,
    params.to
  );

  return {
    ticketsVolume: commissionTotals.earnedAmount,
    ticketsVolumeTotal: commissionTotals.commissionBase,
    tournamentTicketsVolumeTotal: commissionTotals.tournamentCommissionBase,
    tournamentCommission: commissionTotals.tournamentEarnedAmount,
    tournamentGuaranteePayout: 0,
    gatewayPurchases: 0,
    deposits,
    withdrawals,
    net: deposits - withdrawals,
  };
}

/**
 * دریافت اطلاعات پایه کاربر (برای نمایش نام، نقش و کد معرف).
 *
 * منبع داده:
 * - auth.getUser برای اطلاعات پایه
 * - جدول public.users برای role و referral_code
 */
export async function loadDashboardUserInfo(): Promise<DashboardUserInfo | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("loadDashboardUserInfo: auth.getUser error", userError);
    return null;
  }

  // تلاش برای خواندن از جدول users
  const { data: dbUser, error: dbError } = await supabase
    .from("users")
    .select("id, username, role, referral_code, admin_sub_role, parent_id")
    .eq("id", user.id)
    .single();

  if (dbError) {
    console.warn("loadDashboardUserInfo: users table read error", dbError.message);
  }

  // نرمال‌سازی role به lowercase
  const roleRaw =
    (dbUser?.role as DashboardUserInfo["role"]) ||
    (user.user_metadata?.role as DashboardUserInfo["role"]) ||
    "player";
  const role = (typeof roleRaw === "string" ? (roleRaw.toLowerCase() as DashboardUserInfo["role"]) : "player") ??
    "player";

  // نرمال‌سازی admin_sub_role به lowercase و محدود به مقادیر مجاز
  const rawSubRole = (dbUser as any)?.admin_sub_role ?? null;
  const loweredSubRole =
    rawSubRole && typeof rawSubRole === "string" ? rawSubRole.toLowerCase() : null;
  const allowedSubRoles = ["manager", "finance", "support", "room", "dev_panel"];
  const adminSubRole =
    loweredSubRole !== null && allowedSubRoles.includes(loweredSubRole)
    ? (loweredSubRole as DashboardUserInfo["adminSubRole"])
    : null;

  // دریافت nickname از user_profiles
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("nickname")
    .eq("user_id", user.id)
    .single();

  // نمایش نام:
  // اولویت: nickname از user_profiles → username از users → full_name از metadata → بخش قبل از @ در email
  let displayName =
    profile?.nickname ||
    dbUser?.username ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "کاربر";

  return {
    id: user.id,
    shortId: makeShortIdFromUuid(user.id),
    displayName,
    role,
    referralCode: dbUser?.referral_code ?? null,
    parentId: (dbUser as any)?.parent_id ?? null,
    adminSubRole,
  };
}

/**
 * محاسبه تاریخ شروع برای یک دوره (بر پایه UTC)
 */
function getPeriodStart(period: DashboardPeriod): Date {
  const now = new Date();

  if (period === "day") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  } else if (period === "week") {
    return getRollingWeekStart(now);
  } else {
    return getRollingMonthStart(now);
  }
}

function iso(d: Date) {
  return d.toISOString();
}

function sumRowsSince(rows: any[], startIso: string, pick: (row: any) => number): number {
  return (rows || []).reduce((sum: number, row: any) => {
    const createdAt = String(row.created_at ?? "");
    if (!createdAt || createdAt < startIso) return sum;
    return sum + pick(row);
  }, 0);
}

function operatorRoleForUser(role: DashboardUserInfo["role"]): CommissionOperatorRole | null {
  if (role === "agent") return "agent";
  if (role === "super") return "super";
  return null;
}

function commissionTotalsFromDailyRows(
  rows: CommissionDailyStatRow[],
  fromDate?: string | null,
  toDate?: string | null
) {
  return sumCommissionDailyRows(rows, { fromDate, toDate });
}

/**
 * داده‌های مالی داشبورد.
 *
 * این تابع داده‌های واقعی را از دیتابیس می‌گیرد:
 * - کانیات: کمیسیون از بازی‌ها (از commissions_log)
 * - واریز: تراکنش‌های deposit از manual_panel
 * - برداشت: تراکنش‌های withdraw از manual_panel
 * - بیلان: واریز - برداشت
 */
export async function loadDashboardData(options?: { maxAgeMs?: number; force?: boolean }): Promise<DashboardData> {
  if (isAdminPanelRoute()) {
    return loadDashboardDataFromAdminSnapshot(options);
  }

  const user = await loadDashboardUserInfo();

  if (!user) {
    return {
      user: null,
      summaries: DEFAULT_SUMMARIES,
      activeRoomsCount: 0,
    };
  }

  const summaries: Record<DashboardPeriod, FinancialSummary> = {
    day: {
      period: "day",
      ticketsVolume: 0,
      ticketsVolumeTotal: 0,
      tournamentTicketsVolumeTotal: 0,
      tournamentCommission: 0,
      tournamentGuaranteePayout: 0,
      gatewayPurchases: 0,
      deposits: 0,
      withdrawals: 0,
      net: 0,
    },
    week: {
      period: "week",
      ticketsVolume: 0,
      ticketsVolumeTotal: 0,
      tournamentTicketsVolumeTotal: 0,
      tournamentCommission: 0,
      tournamentGuaranteePayout: 0,
      gatewayPurchases: 0,
      deposits: 0,
      withdrawals: 0,
      net: 0,
    },
    month: {
      period: "month",
      ticketsVolume: 0,
      ticketsVolumeTotal: 0,
      tournamentTicketsVolumeTotal: 0,
      tournamentCommission: 0,
      tournamentGuaranteePayout: 0,
      gatewayPurchases: 0,
      deposits: 0,
      withdrawals: 0,
      net: 0,
    },
    overall: {
      period: "overall",
      ticketsVolume: 0,
      ticketsVolumeTotal: 0,
      tournamentTicketsVolumeTotal: 0,
      tournamentCommission: 0,
      tournamentGuaranteePayout: 0,
      gatewayPurchases: 0,
      deposits: 0,
      withdrawals: 0,
      net: 0,
    },
  };

  // Optimization: fetch once since month start, derive day/week/month locally.
  const monthStart = getPeriodStart("month");
  const weekStart = getPeriodStart("week");
  const dayStart = getPeriodStart("day");

  if (user.role !== "admin" && user.role !== "super" && user.role !== "agent") {
    const data: DashboardData = { user, summaries, activeRoomsCount: 0 };
    const cacheKey = `v10|${user.id}|${user.role}|${user.id}`;
    dashboardCache = { key: cacheKey, fetchedAtMs: Date.now(), data };
    return data;
  }

  const monthIso = iso(monthStart);
  const weekIso = iso(weekStart);
  const dayIso = iso(dayStart);

  const maxAgeMs = options?.maxAgeMs ?? 30_000;
  // Bump this when cache semantics change.
  const cacheKey = `v10|${user.id}|${user.role}|${user.parentId ?? ""}`;
  if (!options?.force && dashboardCache?.key === cacheKey) {
    const ageMs = Date.now() - dashboardCache.fetchedAtMs;
    if (ageMs >= 0 && ageMs <= maxAgeMs) {
      return dashboardCache.data;
    }
  }

  // NOTE: client-side Supabase is subject to RLS. For admin commission totals,
  // use a server route (service role) so admin sub-roles can see adminzero totals.
  const adminCommissionMap:
    | {
        admin: Record<Exclude<DashboardPeriod, "overall">, number>;
        total: Record<Exclude<DashboardPeriod, "overall">, number>;
        tournamentTotal: Record<Exclude<DashboardPeriod, "overall">, number>;
        tournament: Record<Exclude<DashboardPeriod, "overall">, number>;
      }
    | null =
    user.role === "admin"
      ? await fetchAdminCommissionSummary().then((s) => ({
          admin: {
            day: s.day,
            week: s.week,
            month: s.month,
          },
          total: {
            day: s.dayTotal,
            week: s.weekTotal,
            month: s.monthTotal,
          },
          tournamentTotal: {
            day: s.dayTournamentTotal,
            week: s.weekTournamentTotal,
            month: s.monthTournamentTotal,
          },
          tournament: {
            day: s.dayTournament,
            week: s.weekTournament,
            month: s.monthTournament,
          },
        }))
      : null;
  const adminGuaranteeMap:
    | {
        day: number;
        week: number;
        month: number;
      }
    | null =
    user.role === "admin"
      ? await fetchAdminGuaranteeSummary().then((s) => ({
          day: s.day,
          week: s.week,
          month: s.month,
        }))
      : null;

  const manualPanelQuery = supabase
    .from("transactions")
    .select("amount, type, created_at")
    .eq("source_kind", "manual_panel")
    .eq("source_ref", user.id)
    .in("type", ["deposit", "withdraw"]);

  const transferQuery = supabase
    .from("transactions")
    .select("amount, meta, created_at")
    .eq("source_kind", "admin_panel_transfer")
    // Each panel transfer creates TWO rows (transfer_out + transfer_in) with same actor/action.
    // Keep only one side to avoid double counting in dashboard totals.
    .eq("type", "transfer_out")
    .filter("meta->>actor_id", "eq", user.id);

  const operatorRole = operatorRoleForUser(user.role);
  let commissionDailyRows: CommissionDailyStatRow[] = [];
  let manualPanelTxsRes: { data: any[] | null; error: any };
  let transferTxsRes: { data: any[] | null; error: any };

  if (user.role === "admin") {
    [manualPanelTxsRes, transferTxsRes] = await Promise.all([manualPanelQuery, transferQuery]);
  } else {
    [commissionDailyRows, manualPanelTxsRes, transferTxsRes] = await Promise.all([
      loadCommissionDailyStatRows({
        supabase,
        userId: user.id,
        role: operatorRole!,
      }),
      manualPanelQuery,
      transferQuery,
    ]);
  }

  if (manualPanelTxsRes.error) {
    console.error("loadDashboardData: manual_panel tx error:", manualPanelTxsRes.error);
  }
  if (transferTxsRes.error) {
    console.error("loadDashboardData: admin_panel_transfer tx error:", transferTxsRes.error);
  }

  const manualTxs = manualPanelTxsRes.data || [];
  const transferTxs = transferTxsRes.data || [];

  const depositsFor = (startIso: string) => {
    const manual = sumRowsSince(manualTxs, startIso, (t) =>
      String(t.type) === "deposit" ? Number(t.amount || 0) : 0
    );
    const transfer = sumRowsSince(transferTxs, startIso, (t) =>
      String((t.meta as any)?.action ?? "") === "deposit" ? Number(t.amount || 0) : 0
    );
    return manual + transfer;
  };
  const withdrawalsFor = (startIso: string) => {
    const manual = sumRowsSince(manualTxs, startIso, (t) =>
      String(t.type) === "withdraw" ? Number(t.amount || 0) : 0
    );
    const transfer = sumRowsSince(transferTxs, startIso, (t) =>
      String((t.meta as any)?.action ?? "") === "withdraw" ? Number(t.amount || 0) : 0
    );
    return manual + transfer;
  };
  const commissionFor = (period: DashboardPeriod, startDate: string | null) => {
    if (user.role === "admin") {
      if (period === "overall") return 0;
      return adminCommissionMap?.admin[period] ?? 0;
    }

    return commissionTotalsFromDailyRows(commissionDailyRows, startDate).earnedAmount;
  };

  const commissionBaseFor = (period: DashboardPeriod, startDate: string | null) => {
    if (user.role === "admin") {
      if (period === "overall") return 0;
      return adminCommissionMap?.total[period] ?? 0;
    }

    return commissionTotalsFromDailyRows(commissionDailyRows, startDate).commissionBase;
  };

  const tournamentCommissionBaseFor = (period: DashboardPeriod, startDate: string | null) => {
    if (user.role === "admin") {
      if (period === "overall") return 0;
      return adminCommissionMap?.tournamentTotal[period] ?? 0;
    }

    return commissionTotalsFromDailyRows(commissionDailyRows, startDate).tournamentCommissionBase;
  };

  const tournamentCommissionFor = (period: DashboardPeriod, startDate: string | null) => {
    if (user.role === "agent" || user.role === "super") {
      return commissionTotalsFromDailyRows(commissionDailyRows, startDate).tournamentEarnedAmount;
    }
    if (period === "overall") return 0;
    return adminCommissionMap?.tournament[period] ?? 0;
  };

  for (const [period, startDate] of [
    ["day", dayIso.slice(0, 10)],
    ["week", weekIso.slice(0, 10)],
    ["month", monthIso.slice(0, 10)],
    ["overall", null],
  ] as Array<[DashboardPeriod, string | null]>) {
    const commission = commissionFor(period, startDate);
    const commissionBase = commissionBaseFor(period, startDate);
    const deposits = startDate
      ? depositsFor(startDate + "T00:00:00.000Z")
      : depositsFor("1970-01-01T00:00:00.000Z");
    const withdrawals = startDate
      ? withdrawalsFor(startDate + "T00:00:00.000Z")
      : withdrawalsFor("1970-01-01T00:00:00.000Z");
    const net = deposits - withdrawals;

    summaries[period] = {
      period,
      ticketsVolume: commission,
      ticketsVolumeTotal: commissionBase,
      tournamentTicketsVolumeTotal: tournamentCommissionBaseFor(period, startDate),
      tournamentCommission: tournamentCommissionFor(period, startDate),
      tournamentGuaranteePayout:
        user.role === "admin" && period !== "overall"
          ? adminGuaranteeMap?.[period] ?? 0
          : 0,
      gatewayPurchases: 0,
      deposits,
      withdrawals,
      net,
    };
  }

  const data: DashboardData = {
    user,
    summaries,
    activeRoomsCount: 0,
  };
  dashboardCache = { key: cacheKey, fetchedAtMs: Date.now(), data };
  return data;
}


