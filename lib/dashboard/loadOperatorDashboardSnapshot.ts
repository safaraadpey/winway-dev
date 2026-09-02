import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DashboardData,
  DashboardPeriod,
  DashboardUserInfo,
  FinancialSummary,
} from "@/src/types/dashboard";
import {
  loadOperatorLiveDaySummary,
  loadOperatorOverallSnapshotSummary,
  loadOperatorWeekSnapshotSummary,
} from "@/lib/dashboard/loadOperatorDashboardPeriodSummary";

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
  playerWinnings: 0,
  playerPurchases: 0,
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
    .select("id, username, role, referral_code, parent_id")
    .eq("id", user.id)
    .single();

  if (dbError) {
    console.warn("[DashboardSnapshot] operator users table read error", dbError.message);
  }

  const roleRaw =
    (dbUser?.role as DashboardUserInfo["role"]) ||
    (user.user_metadata?.role as DashboardUserInfo["role"]) ||
    "player";
  const role =
    (typeof roleRaw === "string"
      ? (roleRaw.toLowerCase() as DashboardUserInfo["role"])
      : "player") ?? "player";

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
    role,
    referralCode: dbUser?.referral_code ?? null,
    parentId: (dbUser as { parent_id?: string | null } | null)?.parent_id ?? null,
    adminSubRole: null,
  };
}

function operatorRoleFromUser(
  role: DashboardUserInfo["role"]
): "agent" | "super" | null {
  if (role === "agent" || role === "super") return role;
  return null;
}

/**
 * Initial agent/super dashboard load (week + overall):
 * - week: closed performance_daily_stats (Sat 08:00 → last closed day)
 * - overall: performance_lifetime_stats
 * Day summary loads on demand via loadOperatorDashboardDaySnapshot.
 */
export async function loadOperatorDashboardSnapshot(
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

  const operatorRole = operatorRoleFromUser(user.role);
  if (!operatorRole) {
    throw new Error("FORBIDDEN");
  }

  const [weekSummary, overallSummary] = await Promise.all([
    loadOperatorWeekSnapshotSummary({
      supabase,
      operatorId: user.id,
      role: operatorRole,
    }),
    loadOperatorOverallSnapshotSummary({
      operatorId: user.id,
      role: operatorRole,
    }),
  ]);

  const summaries: Record<DashboardPeriod, FinancialSummary> = {
    day: EMPTY_SUMMARY("day"),
    week: weekSummary,
    month: EMPTY_SUMMARY("month"),
    overall: overallSummary,
  };

  return {
    user,
    summaries,
    activeRoomsCount: 0,
  };
}

/** Live day tab: open Tehran 08:00 → now (loaded on demand). */
export async function loadOperatorDashboardDaySnapshot(
  supabase: SupabaseClient
): Promise<FinancialSummary> {
  const user = await loadDashboardUserInfo(supabase);
  if (!user) {
    return EMPTY_SUMMARY("day");
  }

  const operatorRole = operatorRoleFromUser(user.role);
  if (!operatorRole) {
    throw new Error("FORBIDDEN");
  }

  return loadOperatorLiveDaySummary({
    supabase,
    operatorId: user.id,
    role: operatorRole,
  });
}
