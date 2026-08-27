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
  type CommissionDailyTotals,
  type CommissionOperatorRole,
} from "@/lib/dashboard/loadCommissionDailyStats";
import {
  emptyCommissionTotals,
  loadOperatorCommissionSummaryRange,
  loadOperatorPeriodCommissionSummary,
  type OperatorPeriodCommissionMap,
} from "@/lib/dashboard/loadOperatorCommissionSummary";
import {
  emptyOperatorPlayerGamePerformanceByPeriod,
  emptyPlayerGamePerformance,
  type OperatorPlayerGamePerformanceByPeriod,
  type PlayerGamePerformance,
} from "@/lib/dashboard/playerGamePerformance";
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
  directPlayerCommission: number;
  tournamentGuaranteePayout: number;
  gatewayPurchases: number;
  deposits: number;
  withdrawals: number;
  net: number;
  playerWinnings?: number;
  playerPurchases?: number;
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
    directPlayerCommission: 0,
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
    directPlayerCommission: 0,
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
    directPlayerCommission: 0,
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
    directPlayerCommission: 0,
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
  const cacheKey = "admin-snapshot|v5";

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
  dayDirect: number;
  weekDirect: number;
  monthDirect: number;
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
    dayDirect: Number((row as any).day_direct_amount || 0),
    weekDirect: Number((row as any).week_direct_amount || 0),
    monthDirect: Number((row as any).month_direct_amount || 0),
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
  directAmount: number;
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
    directAmount: Number((row as any).direct_amount || 0),
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
      directPlayerCommission: 0,
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

  const operatorRole = operatorRoleForUser(user.role);
  const [manualRes, transferRes, operatorRangeTotals, playerGameRange] = await Promise.all([
    manualPanelQuery,
    transferQuery,
    user.role === "admin" || !operatorRole
      ? Promise.resolve(emptyCommissionTotals())
      : loadOperatorCommissionSummaryRange({
          supabase,
          userId: user.id,
          role: operatorRole,
          fromIso,
          toIso,
        }),
    operatorRole
      ? fetchOperatorPlayerGamePerformanceRange(params.from, params.to)
      : Promise.resolve(emptyPlayerGamePerformance()),
  ]);

  if (manualRes.error) throw new Error("خطا در دریافت واریز/برداشت");
  if (transferRes.error) throw new Error("خطا در دریافت تراکنش‌های پنلی");

  const manualRows = manualRes.data || [];
  const transferRows = transferRes.data || [];

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
      directPlayerCommission: admin.directAmount,
      tournamentGuaranteePayout: guarantee.amount,
      gatewayPurchases,
      deposits,
      withdrawals,
      net: deposits - withdrawals,
      panelOperators,
    };
  }

  return {
    ticketsVolume: operatorRangeTotals.earnedAmount,
    ticketsVolumeTotal: operatorRangeTotals.commissionBase,
    tournamentTicketsVolumeTotal: operatorRangeTotals.tournamentCommissionBase,
    tournamentCommission: operatorRangeTotals.tournamentEarnedAmount,
    directPlayerCommission: 0,
    tournamentGuaranteePayout: 0,
    gatewayPurchases: 0,
    deposits,
    withdrawals,
    net: deposits - withdrawals,
    playerWinnings: playerGameRange.playerWinnings,
    playerPurchases: playerGameRange.playerPurchases,
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

async function fetchOperatorPlayerGamePerformanceByPeriod(): Promise<OperatorPlayerGamePerformanceByPeriod> {
  try {
    const data = await callAdminApi<OperatorPlayerGamePerformanceByPeriod>(
      "/api/agent/dashboard/player-game-performance",
      { method: "GET" }
    );
    return {
      day: {
        playerWinnings: Number(data?.day?.playerWinnings || 0),
        playerPurchases: Number(data?.day?.playerPurchases || 0),
        gamesPlayed: Number(data?.day?.gamesPlayed || 0),
      },
      week: {
        playerWinnings: Number(data?.week?.playerWinnings || 0),
        playerPurchases: Number(data?.week?.playerPurchases || 0),
        gamesPlayed: Number(data?.week?.gamesPlayed || 0),
      },
      month: {
        playerWinnings: Number(data?.month?.playerWinnings || 0),
        playerPurchases: Number(data?.month?.playerPurchases || 0),
        gamesPlayed: Number(data?.month?.gamesPlayed || 0),
      },
      overall: {
        playerWinnings: Number(data?.overall?.playerWinnings || 0),
        playerPurchases: Number(data?.overall?.playerPurchases || 0),
        gamesPlayed: Number(data?.overall?.gamesPlayed || 0),
      },
    };
  } catch (error) {
    console.error("[Dashboard] player game performance fetch error:", error);
    return emptyOperatorPlayerGamePerformanceByPeriod();
  }
}

async function fetchOperatorPlayerGamePerformanceRange(
  from: string,
  to: string
): Promise<PlayerGamePerformance> {
  try {
    const data = await callAdminApi<PlayerGamePerformance>(
      `/api/agent/dashboard/player-game-performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: "GET" }
    );
    return {
      playerWinnings: Number(data?.playerWinnings || 0),
      playerPurchases: Number(data?.playerPurchases || 0),
      gamesPlayed: Number(data?.gamesPlayed || 0),
    };
  } catch (error) {
    console.error("[Dashboard] player game performance range fetch error:", error);
    return emptyPlayerGamePerformance();
  }
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
      directPlayerCommission: 0,
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
      directPlayerCommission: 0,
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
      directPlayerCommission: 0,
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
      directPlayerCommission: 0,
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
    const cacheKey = `v12|${user.id}|${user.role}|${user.id}`;
    dashboardCache = { key: cacheKey, fetchedAtMs: Date.now(), data };
    return data;
  }

  const monthIso = iso(monthStart);
  const weekIso = iso(weekStart);
  const dayIso = iso(dayStart);

  const maxAgeMs = options?.maxAgeMs ?? 30_000;
  // Bump this when cache semantics change.
  const cacheKey = `v12|${user.id}|${user.role}|${user.parentId ?? ""}`;
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
        direct: Record<Exclude<DashboardPeriod, "overall">, number>;
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
          direct: {
            day: s.dayDirect,
            week: s.weekDirect,
            month: s.monthDirect,
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
  let operatorPeriodTotals: OperatorPeriodCommissionMap | null = null;
  let playerGameByPeriod = emptyOperatorPlayerGamePerformanceByPeriod();
  let manualPanelTxsRes: { data: any[] | null; error: any };
  let transferTxsRes: { data: any[] | null; error: any };

  if (user.role === "admin") {
    [manualPanelTxsRes, transferTxsRes] = await Promise.all([manualPanelQuery, transferQuery]);
  } else {
    [
      commissionDailyRows,
      operatorPeriodTotals,
      manualPanelTxsRes,
      transferTxsRes,
      playerGameByPeriod,
    ] = await Promise.all([
      loadCommissionDailyStatRows({
        supabase,
        userId: user.id,
        role: operatorRole!,
      }),
      loadOperatorPeriodCommissionSummary({
        supabase,
        userId: user.id,
        role: operatorRole!,
      }),
      manualPanelQuery,
      transferQuery,
      fetchOperatorPlayerGamePerformanceByPeriod(),
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
  const operatorTotalsFor = (period: DashboardPeriod): CommissionDailyTotals => {
    if (period === "overall") {
      return commissionTotalsFromDailyRows(commissionDailyRows, null);
    }
    if (!operatorPeriodTotals) return emptyCommissionTotals();
    return operatorPeriodTotals[period];
  };

  const commissionFor = (period: DashboardPeriod) => {
    if (user.role === "admin") {
      if (period === "overall") return 0;
      return adminCommissionMap?.admin[period] ?? 0;
    }

    return operatorTotalsFor(period).earnedAmount;
  };

  const commissionBaseFor = (period: DashboardPeriod) => {
    if (user.role === "admin") {
      if (period === "overall") return 0;
      return adminCommissionMap?.total[period] ?? 0;
    }

    return operatorTotalsFor(period).commissionBase;
  };

  const tournamentCommissionBaseFor = (period: DashboardPeriod) => {
    if (user.role === "admin") {
      if (period === "overall") return 0;
      return adminCommissionMap?.tournamentTotal[period] ?? 0;
    }

    return operatorTotalsFor(period).tournamentCommissionBase;
  };

  const tournamentCommissionFor = (period: DashboardPeriod) => {
    if (user.role === "agent" || user.role === "super") {
      return operatorTotalsFor(period).tournamentEarnedAmount;
    }
    if (period === "overall") return 0;
    return adminCommissionMap?.tournament[period] ?? 0;
  };
  const directPlayerCommissionFor = (period: DashboardPeriod) => {
    if (user.role !== "admin" || period === "overall") return 0;
    return adminCommissionMap?.direct[period] ?? 0;
  };

  for (const [period, startIso] of [
    ["day", dayIso],
    ["week", weekIso],
    ["month", monthIso],
    ["overall", null],
  ] as Array<[DashboardPeriod, string | null]>) {
    const commission = commissionFor(period);
    const commissionBase = commissionBaseFor(period);
    const deposits = startIso
      ? depositsFor(startIso)
      : depositsFor("1970-01-01T00:00:00.000Z");
    const withdrawals = startIso
      ? withdrawalsFor(startIso)
      : withdrawalsFor("1970-01-01T00:00:00.000Z");
    const net = deposits - withdrawals;

    summaries[period] = {
      period,
      ticketsVolume: commission,
      ticketsVolumeTotal: commissionBase,
      tournamentTicketsVolumeTotal: tournamentCommissionBaseFor(period),
      tournamentCommission: tournamentCommissionFor(period),
      directPlayerCommission: directPlayerCommissionFor(period),
      tournamentGuaranteePayout:
        user.role === "admin" && period !== "overall"
          ? adminGuaranteeMap?.[period] ?? 0
          : 0,
      gatewayPurchases: 0,
      deposits,
      withdrawals,
      net,
      playerWinnings: playerGameByPeriod[period].playerWinnings,
      playerPurchases: playerGameByPeriod[period].playerPurchases,
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


