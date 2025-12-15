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
    let commissionQuery = supabase
      .from("commissions_log")
      .select("agent_amount, super_amount, admin_amount")
      .gte("created_at", periodStart.toISOString());

    // فیلتر بر اساس نقش
    if (role === "admin") {
      // admin: همه کمیسیون‌ها
      // نیازی به فیلتر اضافی نیست
    } else if (role === "super") {
      // super: فقط کمیسیون‌های super_id = userId
      commissionQuery = commissionQuery.eq("super_id", userId);
    } else if (role === "agent") {
      // agent: فقط کمیسیون‌های agent_id = userId
      commissionQuery = commissionQuery.eq("agent_id", userId);
    } else {
      // player: هیچ کمیسیونی ندارد
      return 0;
    }

    const { data, error } = await commissionQuery;

    if (error) {
      console.error("calculateCommission error:", error);
      return 0;
    }

    // جمع کردن کمیسیون‌ها بر اساس نقش
    let total = 0;
    (data || []).forEach((row: any) => {
      if (role === "admin") {
        total += Number(row.admin_amount || 0) + Number(row.super_amount || 0) + Number(row.agent_amount || 0);
      } else if (role === "super") {
        total += Number(row.super_amount || 0);
      } else if (role === "agent") {
        total += Number(row.agent_amount || 0);
      }
    });

    return total;
  } catch (err) {
    console.error("calculateCommission unexpected error:", err);
    return 0;
  }
}

/**
 * محاسبه واریز و برداشت برای یک کاربر در یک بازه زمانی
 */
async function calculateDepositsWithdrawals(
  userId: string,
  role: DashboardUserInfo["role"],
  periodStart: Date
): Promise<{ deposits: number; withdrawals: number }> {
  try {
    // تعیین کاربران زیرمجموعه برای فیلتر
    let targetUserIds: string[] = [];

    if (role === "admin") {
      // admin: همه کاربران
      const { data: allUsers } = await supabase
        .from("users")
        .select("id")
        .in("role", ["player", "agent", "super"]);
      targetUserIds = (allUsers || []).map((u: any) => u.id);
    } else if (role === "super") {
      // super: agents و players زیر این super
      // 1. agents مستقیم
      const { data: agentsData } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", userId)
        .eq("role", "agent");
      const agentIds = (agentsData || []).map((a: any) => a.id);
      targetUserIds.push(...agentIds);

      // 2. players مستقیم
      const { data: directPlayersData } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", userId)
        .eq("role", "player");
      const directPlayerIds = (directPlayersData || []).map((p: any) => p.id);
      targetUserIds.push(...directPlayerIds);

      // 3. players زیر agents
      if (agentIds.length > 0) {
        const { data: playersData } = await supabase
          .from("users")
          .select("id")
          .in("parent_id", agentIds)
          .eq("role", "player");
        const playerIds = (playersData || []).map((p: any) => p.id);
        targetUserIds.push(...playerIds);
      }

      // حذف duplicates
      targetUserIds = Array.from(new Set(targetUserIds));
    } else if (role === "agent") {
      // agent: players زیر این agent
      // 1. players مستقیم
      const { data: directPlayersData } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", userId)
        .eq("role", "player");
      const directPlayerIds = (directPlayersData || []).map((p: any) => p.id);
      targetUserIds.push(...directPlayerIds);

      // حذف duplicates
      targetUserIds = Array.from(new Set(targetUserIds));
    }

    if (targetUserIds.length === 0) {
      return { deposits: 0, withdrawals: 0 };
    }

    // گرفتن واریزها (deposits) از manual_panel
    const { data: depositsData, error: depositsError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("type", "deposit")
      .eq("source_kind", "manual_panel")
      .in("user_id", targetUserIds)
      .gte("created_at", periodStart.toISOString());

    if (depositsError) {
      console.error("calculateDepositsWithdrawals deposits error:", depositsError);
    }

    // گرفتن برداشت‌ها (withdrawals) از manual_panel
    const { data: withdrawalsData, error: withdrawalsError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("type", "withdraw")
      .eq("source_kind", "manual_panel")
      .in("user_id", targetUserIds)
      .gte("created_at", periodStart.toISOString());

    if (withdrawalsError) {
      console.error("calculateDepositsWithdrawals withdrawals error:", withdrawalsError);
    }

    const deposits = (depositsData || []).reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    const withdrawals = (withdrawalsData || []).reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

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


