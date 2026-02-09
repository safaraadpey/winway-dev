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
    deposits: 0,
    withdrawals: 0,
    net: 0,
  },
  week: {
    period: "week",
    ticketsVolume: 0,
    deposits: 0,
    withdrawals: 0,
    net: 0,
  },
  month: {
    period: "month",
    ticketsVolume: 0,
    deposits: 0,
    withdrawals: 0,
    net: 0,
  },
};

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
    .select("id, username, role, referral_code, admin_sub_role")
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

/**
 * محاسبه کمیسیون (کانبات) برای یک کاربر در یک بازه زمانی
 */
async function calculateCommission(
  userId: string,
  role: DashboardUserInfo["role"],
  periodStart: Date
): Promise<number> {
  try {
    if (role !== "admin" && role !== "super" && role !== "agent") {
      return 0;
    }

    // کمیسیون‌های واقعی ثبت‌شده در کیف پول کاربر (fee_* در تراکنش‌ها)
    const { data, error } = await supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .in("type", ["fee_admin", "fee_super", "fee_agent"])
      .gte("created_at", periodStart.toISOString());

    if (error) {
      console.error("calculateCommission error:", error);
      return 0;
    }

    const total = (data || []).reduce(
      (sum: number, row: any) => sum + Number(row.amount || 0),
      0
    );

    return total;
  } catch (err) {
    console.error("calculateCommission unexpected error:", err);
    return 0;
  }
}

/**
 * محاسبه واریز و برداشت پنلی (actor) برای یک کاربر در یک بازه زمانی
 */
async function calculateDepositsWithdrawals(
  userId: string,
  role: DashboardUserInfo["role"],
  periodStart: Date
): Promise<{ deposits: number; withdrawals: number }> {
  try {
    if (role !== "admin" && role !== "super" && role !== "agent") {
      return { deposits: 0, withdrawals: 0 };
    }

    // 1) مسیر قدیمی manual_panel: actor در source_ref است
    const { data: manualDeposits, error: manualDepositsError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("source_kind", "manual_panel")
      .eq("type", "deposit")
      .eq("source_ref", userId)
      .gte("created_at", periodStart.toISOString());

    if (manualDepositsError) {
      console.error("calculateDepositsWithdrawals manual deposits error:", manualDepositsError);
    }

    const { data: manualWithdrawals, error: manualWithdrawalsError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("source_kind", "manual_panel")
      .eq("type", "withdraw")
      .eq("source_ref", userId)
      .gte("created_at", periodStart.toISOString());

    if (manualWithdrawalsError) {
      console.error("calculateDepositsWithdrawals manual withdrawals error:", manualWithdrawalsError);
    }

    // 2) مسیر جدید admin_panel_transfer: actor در meta.actor_id و اکشن در meta.action است
    const { data: transferDeposits, error: transferDepositsError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("source_kind", "admin_panel_transfer")
      .filter("meta->>actor_id", "eq", userId)
      .filter("meta->>action", "eq", "deposit")
      .gte("created_at", periodStart.toISOString());

    if (transferDepositsError) {
      console.error("calculateDepositsWithdrawals transfer deposits error:", transferDepositsError);
    }

    const { data: transferWithdrawals, error: transferWithdrawalsError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("source_kind", "admin_panel_transfer")
      .filter("meta->>actor_id", "eq", userId)
      .filter("meta->>action", "eq", "withdraw")
      .gte("created_at", periodStart.toISOString());

    if (transferWithdrawalsError) {
      console.error("calculateDepositsWithdrawals transfer withdrawals error:", transferWithdrawalsError);
    }

    const deposits =
      (manualDeposits || []).reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0) +
      (transferDeposits || []).reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    const withdrawals =
      (manualWithdrawals || []).reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0) +
      (transferWithdrawals || []).reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

    return { deposits, withdrawals };
  } catch (err) {
    console.error("calculateDepositsWithdrawals unexpected error:", err);
    return { deposits: 0, withdrawals: 0 };
  }
}

/**
 * داده‌های مالی داشبورد.
 *
 * این تابع داده‌های واقعی را از دیتابیس می‌گیرد:
 * - کانبات: کمیسیون از بازی‌ها (از commissions_log)
 * - واریز: تراکنش‌های deposit از manual_panel
 * - برداشت: تراکنش‌های withdraw از manual_panel
 * - بیلان: واریز - برداشت
 */
export async function loadDashboardData(): Promise<DashboardData> {
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
      deposits: 0,
      withdrawals: 0,
      net: 0,
    },
    week: {
      period: "week",
      ticketsVolume: 0,
      deposits: 0,
      withdrawals: 0,
      net: 0,
    },
    month: {
      period: "month",
      ticketsVolume: 0,
      deposits: 0,
      withdrawals: 0,
      net: 0,
    },
  };

  // محاسبه برای هر دوره
  for (const period of ["day", "week", "month"] as DashboardPeriod[]) {
    const periodStart = getPeriodStart(period);

    // محاسبه کمیسیون (کانبات)
    const commission = await calculateCommission(user.id, user.role, periodStart);

    // محاسبه واریز و برداشت
    const { deposits, withdrawals } = await calculateDepositsWithdrawals(
      user.id,
      user.role,
      periodStart
    );

    // محاسبه بیلان
    const net = deposits - withdrawals;

    summaries[period] = {
      period,
      ticketsVolume: commission, // کانبات = کمیسیون
      deposits,
      withdrawals,
      net,
    };
  }

  return {
    user,
    summaries,
  };
}


