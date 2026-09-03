import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DashboardData,
  DashboardPeriod,
  DashboardUserInfo,
  FinancialSummary,
} from "@/src/types/dashboard";
import {
  loadAdminLiveDaySummary,
  loadAdminWeekSnapshotSummary,
} from "@/lib/dashboard/loadAdminDashboardPeriodSummary";

function makeShortIdFromUuid(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(31, hash) + id.charCodeAt(i);
  }
  const num = (hash >>> 0) % 1_000_000_0000;
  return num.toString().padStart(10, "0");
}

const EMPTY_SUMMARY = (period: DashboardPeriod): FinancialSummary => ({
  period,
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
});

async function loadDashboardUserInfo(
  supabase: SupabaseClient
): Promise<DashboardUserInfo | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: dbUser, error: dbError } = await supabase
    .from("users")
    .select("id, username, role, referral_code, admin_sub_role, parent_id")
    .eq("id", user.id)
    .single();

  if (dbError) {
    console.warn("[DashboardSnapshot] users table read error", dbError.message);
  }

  const roleRaw =
    (dbUser?.role as DashboardUserInfo["role"]) ||
    (user.user_metadata?.role as DashboardUserInfo["role"]) ||
    "player";
  const role =
    (typeof roleRaw === "string"
      ? (roleRaw.toLowerCase() as DashboardUserInfo["role"])
      : "player") ?? "player";

  const rawSubRole = (dbUser as { admin_sub_role?: string | null } | null)?.admin_sub_role ?? null;
  const loweredSubRole =
    rawSubRole && typeof rawSubRole === "string" ? rawSubRole.toLowerCase() : null;
  const allowedSubRoles = ["manager", "finance", "support", "room", "dev_panel"];
  const adminSubRole =
    loweredSubRole !== null && allowedSubRoles.includes(loweredSubRole)
      ? (loweredSubRole as DashboardUserInfo["adminSubRole"])
      : null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("nickname")
    .eq("user_id", user.id)
    .single();

  const displayName =
    profile?.nickname ||
    dbUser?.username ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "کاربر";

  return {
    id: user.id,
    shortId: makeShortIdFromUuid(user.id),
    displayName,
    username: dbUser?.username ?? null,
    role,
    referralCode: dbUser?.referral_code ?? null,
    parentId: (dbUser as { parent_id?: string | null } | null)?.parent_id ?? null,
    adminSubRole,
  };
}

async function fetchActiveRoomsCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .in("status", ["waiting", "playing", "live"]);

  if (error) {
    console.error("[DashboardSnapshot] active rooms count error:", error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Initial admin dashboard load (week only):
 * - week: closed performance_daily_stats (Sat 08:00 → last closed day)
 * Day summary is loaded separately on demand via loadAdminDashboardDaySnapshot.
 */
export async function loadAdminDashboardSnapshot(
  supabase: SupabaseClient
): Promise<DashboardData> {
  const user = await loadDashboardUserInfo(supabase);

  if (!user) {
    return {
      user: null,
      summaries: {
        day: EMPTY_SUMMARY("day"),
        week: EMPTY_SUMMARY("week"),
        month: EMPTY_SUMMARY("month"),
        overall: EMPTY_SUMMARY("overall"),
      },
      activeRoomsCount: 0,
    };
  }

  if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }

  const [weekSummary, activeRoomsCount] = await Promise.all([
    loadAdminWeekSnapshotSummary({ supabase, actorUserId: user.id }),
    fetchActiveRoomsCount(supabase),
  ]);

  const summaries: Record<DashboardPeriod, FinancialSummary> = {
    day: EMPTY_SUMMARY("day"),
    week: weekSummary,
    month: EMPTY_SUMMARY("month"),
    overall: EMPTY_SUMMARY("overall"),
  };

  return {
    user,
    summaries,
    activeRoomsCount,
  };
}

/** Live day tab: open Tehran 08:00 → now (loaded on user request). */
export async function loadAdminDashboardDaySnapshot(
  supabase: SupabaseClient
): Promise<FinancialSummary> {
  const user = await loadDashboardUserInfo(supabase);
  if (!user) {
    return EMPTY_SUMMARY("day");
  }
  if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return loadAdminLiveDaySummary({ supabase, actorUserId: user.id });
}
