// services/dashboard.ts
//
// Service helpers for admin/agent dashboards.
// فعلاً منطق مالی را ساده نگه می‌داریم و فقط اسکلت را می‌سازیم تا بعداً با کوئری‌های دقیق‌تر جایگزین شود.

import { supabase } from "@/lib/supabaseClient";
import type {
  DashboardData,
  DashboardPeriod,
  DashboardUserInfo,
  FinancialSummary,
} from "@/src/types/dashboard";

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
    deposits: 0,
    withdrawals: 0,
    net: 0,
  },
  week: {
    period: "week",
    ticketsVolume: 0,
    ticketsVolumeTotal: 0,
    deposits: 0,
    withdrawals: 0,
    net: 0,
  },
  month: {
    period: "month",
    ticketsVolume: 0,
    ticketsVolumeTotal: 0,
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

export function getCachedDashboardData(): DashboardData | null {
  return dashboardCache?.data ?? null;
}

export function clearDashboardCache() {
  dashboardCache = null;
}

type AdminZeroCache = { id: string | null; fetchedAtMs: number };
let adminZeroCache: AdminZeroCache | null = null;

async function getAdminZeroId(maxAgeMs = 5 * 60_000): Promise<string | null> {
  if (adminZeroCache) {
    const ageMs = Date.now() - adminZeroCache.fetchedAtMs;
    if (ageMs >= 0 && ageMs <= maxAgeMs) return adminZeroCache.id;
  }
  const { data: adminZero, error } = await supabase
    .from("users")
    .select("id")
    .eq("username", "adminzero")
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    console.warn("getAdminZeroId: users read error", error.message);
  }
  const id = (adminZero as any)?.id ?? null;
  adminZeroCache = { id, fetchedAtMs: Date.now() };
  return id;
}

async function fetchAdminCommissionSummary(): Promise<{
  effectiveUserId: string;
  day: number;
  week: number;
  month: number;
}> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error("UNAUTHORIZED");
  }

  const res = await fetch("/api/admin/dashboard/commission-summary", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok || payload?.ok === false) {
    const msg =
      payload?.message ||
      payload?.error ||
      `Failed to load commission summary (HTTP ${res.status})`;
    throw new Error(msg);
  }

  const data = payload?.data || {};
  return {
    effectiveUserId: String(data.effectiveUserId || ""),
    day: Number(data.day || 0),
    week: Number(data.week || 0),
    month: Number(data.month || 0),
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
  const allowedSubRoles = ["manager", "finance", "support", "room"];
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
 * محاسبه تاریخ شروع برای یک دوره
 */
function getPeriodStart(period: DashboardPeriod): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (period === "day") {
    return now;
  } else if (period === "week") {
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
    return new Date(now.getFullYear(), now.getMonth(), diff);
  } else {
    // month
    return new Date(now.getFullYear(), now.getMonth(), 1);
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
  const user = await loadDashboardUserInfo();

  if (!user) {
    return {
      user: null,
      summaries: DEFAULT_SUMMARIES,
    };
  }

  const summaries: Record<DashboardPeriod, FinancialSummary> = {
    day: {
      period: "day",
      ticketsVolume: 0,
      ticketsVolumeTotal: 0,
      deposits: 0,
      withdrawals: 0,
      net: 0,
    },
    week: {
      period: "week",
      ticketsVolume: 0,
      ticketsVolumeTotal: 0,
      deposits: 0,
      withdrawals: 0,
      net: 0,
    },
    month: {
      period: "month",
      ticketsVolume: 0,
      ticketsVolumeTotal: 0,
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
    const data: DashboardData = { user, summaries };
    const cacheKey = `v3|${user.id}|${user.role}|${user.id}`;
    dashboardCache = { key: cacheKey, fetchedAtMs: Date.now(), data };
    return data;
  }

  const monthIso = iso(monthStart);
  const weekIso = iso(weekStart);
  const dayIso = iso(dayStart);

  const maxAgeMs = options?.maxAgeMs ?? 30_000;
  // Bump this when cache semantics change.
  const cacheKey = `v3|${user.id}|${user.role}|${user.parentId ?? ""}`;
  if (!options?.force && dashboardCache?.key === cacheKey) {
    const ageMs = Date.now() - dashboardCache.fetchedAtMs;
    if (ageMs >= 0 && ageMs <= maxAgeMs) {
      return dashboardCache.data;
    }
  }

  // NOTE: client-side Supabase is subject to RLS. For admin commission totals,
  // use a server route (service role) so admin sub-roles can see adminzero totals.
  const adminCommissionMap: Record<DashboardPeriod, number> | null =
    user.role === "admin"
      ? await fetchAdminCommissionSummary().then((s) => ({
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
    .in("type", ["deposit", "withdraw"])
    .gte("created_at", monthIso);

  const transferQuery = supabase
    .from("transactions")
    .select("amount, meta, created_at")
    .eq("source_kind", "admin_panel_transfer")
    .filter("meta->>actor_id", "eq", user.id)
    .gte("created_at", monthIso);

  const commissionQuery =
    user.role === "agent"
      ? supabase
          .from("commissions_log")
          .select("agent_amount, commission_base, created_at")
          .eq("agent_id", user.id)
          .gte("created_at", monthIso)
      : supabase
          .from("commissions_log")
          .select("super_amount, commission_base, created_at")
          .eq("super_id", user.id)
          .gte("created_at", monthIso);

  const [commissionTxsRes, manualPanelTxsRes, transferTxsRes] =
    user.role === "admin"
      ? ([
          { data: [], error: null } as any,
          ...(await Promise.all([manualPanelQuery, transferQuery])),
        ] as any)
      : await Promise.all([commissionQuery, manualPanelQuery, transferQuery]);

  if (commissionTxsRes.error) {
    console.error("loadDashboardData: commission source error:", commissionTxsRes.error);
  }
  if (manualPanelTxsRes.error) {
    console.error("loadDashboardData: manual_panel tx error:", manualPanelTxsRes.error);
  }
  if (transferTxsRes.error) {
    console.error("loadDashboardData: admin_panel_transfer tx error:", transferTxsRes.error);
  }

  const commissionRows = commissionTxsRes.data || [];
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
  const commissionFor = (startIso: string) => {
    if (user.role === "admin") {
      // values are precomputed by server route
      if (startIso === dayIso) return adminCommissionMap?.day ?? 0;
      if (startIso === weekIso) return adminCommissionMap?.week ?? 0;
      return adminCommissionMap?.month ?? 0;
    }
    if (user.role === "agent") {
      return sumRowsSince(commissionRows, startIso, (t) => Number((t as any).agent_amount || 0));
    }
    // super
    return sumRowsSince(commissionRows, startIso, (t) => Number((t as any).super_amount || 0));
  };

  // "کانیات کل" (commission_base): only available for agent/super from commissions_log.
  const commissionBaseFor = (startIso: string) => {
    if (user.role === "admin") return 0;
    return sumRowsSince(commissionRows, startIso, (t) => Number((t as any).commission_base || 0));
  };

  for (const [period, startIso] of [
    ["day", dayIso],
    ["week", weekIso],
    ["month", monthIso],
  ] as Array<[DashboardPeriod, string]>) {
    const commission = commissionFor(startIso);
    const commissionBase = commissionBaseFor(startIso);
    const deposits = depositsFor(startIso);
    const withdrawals = withdrawalsFor(startIso);
    const net = deposits - withdrawals;

    summaries[period] = {
      period,
      ticketsVolume: commission,
      ticketsVolumeTotal: commissionBase,
      deposits,
      withdrawals,
      net,
    };
  }

  const data: DashboardData = {
    user,
    summaries,
  };
  dashboardCache = { key: cacheKey, fetchedAtMs: Date.now(), data };
  return data;
}


