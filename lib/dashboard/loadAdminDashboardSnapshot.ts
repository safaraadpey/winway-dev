import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DashboardData,
  DashboardPeriod,
  DashboardUserInfo,
  FinancialSummary,
} from "@/src/types/dashboard";
import { sumGatewayPurchasesSince } from "@/lib/dashboard/gatewayPurchases";

function makeShortIdFromUuid(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(31, hash) + id.charCodeAt(i);
  }
  const num = (hash >>> 0) % 1_000_000_0000;
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
};

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
    role,
    referralCode: dbUser?.referral_code ?? null,
    parentId: (dbUser as { parent_id?: string | null } | null)?.parent_id ?? null,
    adminSubRole,
  };
}

async function fetchAdminCommissionSummary(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("fn_dashboard_admin_commission_summary");
  if (error) {
    throw new Error(error.message || "Failed to load admin commission summary");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Empty admin commission summary");
  }

  return {
    day: Number((row as { day_amount?: number }).day_amount || 0),
    week: Number((row as { week_amount?: number }).week_amount || 0),
    month: Number((row as { month_amount?: number }).month_amount || 0),
    dayTotal: Number((row as { day_total?: number }).day_total || 0),
    weekTotal: Number((row as { week_total?: number }).week_total || 0),
    monthTotal: Number((row as { month_total?: number }).month_total || 0),
    dayTournamentTotal: Number((row as { day_tournament_total?: number }).day_tournament_total || 0),
    weekTournamentTotal: Number((row as { week_tournament_total?: number }).week_tournament_total || 0),
    monthTournamentTotal: Number((row as { month_tournament_total?: number }).month_tournament_total || 0),
    dayTournament: Number((row as { day_tournament_amount?: number }).day_tournament_amount || 0),
    weekTournament: Number((row as { week_tournament_amount?: number }).week_tournament_amount || 0),
    monthTournament: Number((row as { month_tournament_amount?: number }).month_tournament_amount || 0),
  };
}

async function fetchAdminGuaranteeSummary(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("fn_dashboard_admin_tournament_guarantee_summary");
  if (error) {
    throw new Error(error.message || "Failed to load admin tournament guarantee summary");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Empty admin tournament guarantee summary");
  }

  return {
    day: Number((row as { day_amount?: number }).day_amount || 0),
    week: Number((row as { week_amount?: number }).week_amount || 0),
    month: Number((row as { month_amount?: number }).month_amount || 0),
  };
}

function getPeriodStart(period: DashboardPeriod): Date {
  const now = new Date();

  if (period === "day") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  if (period === "week") {
    const dayOfWeek = now.getUTCDay();
    const diff = now.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff));
  }

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function iso(d: Date) {
  return d.toISOString();
}

function sumRowsSince(rows: unknown[], startIso: string, pick: (row: unknown) => number): number {
  return (rows || []).reduce((sum: number, row: unknown) => {
    const createdAt = String((row as { created_at?: string }).created_at ?? "");
    if (!createdAt || createdAt < startIso) return sum;
    return sum + pick(row);
  }, 0);
}

/**
 * Loads admin dashboard snapshot using a user-scoped Supabase client (auth.uid() in RPCs).
 */
export async function loadAdminDashboardSnapshot(
  supabase: SupabaseClient
): Promise<DashboardData> {
  const user = await loadDashboardUserInfo(supabase);

  if (!user) {
    return {
      user: null,
      summaries: DEFAULT_SUMMARIES,
    };
  }

  if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }

  const monthStart = getPeriodStart("month");
  const weekStart = getPeriodStart("week");
  const dayStart = getPeriodStart("day");
  const monthIso = iso(monthStart);
  const weekIso = iso(weekStart);
  const dayIso = iso(dayStart);

  const [commissionSummary, guaranteeSummary, manualPanelTxsRes, transferTxsRes, gatewayDepositTxsRes] =
    await Promise.all([
      fetchAdminCommissionSummary(supabase),
      fetchAdminGuaranteeSummary(supabase),
      supabase
        .from("transactions")
        .select("amount, type, created_at")
        .eq("source_kind", "manual_panel")
        .eq("source_ref", user.id)
        .in("type", ["deposit", "withdraw"])
        .gte("created_at", monthIso),
      supabase
        .from("transactions")
        .select("amount, meta, created_at")
        .eq("source_kind", "admin_panel_transfer")
        .eq("type", "transfer_out")
        .filter("meta->>actor_id", "eq", user.id)
        .gte("created_at", monthIso),
      supabase
        .from("transactions")
        .select("amount, created_at, idempotency_key")
        .eq("source_kind", "deposit_domain")
        .eq("type", "deposit")
        .gte("created_at", monthIso),
    ]);

  if (manualPanelTxsRes.error) {
    console.error("[DashboardSnapshot] manual_panel tx error:", manualPanelTxsRes.error);
  }
  if (transferTxsRes.error) {
    console.error("[DashboardSnapshot] admin_panel_transfer tx error:", transferTxsRes.error);
  }
  if (gatewayDepositTxsRes.error) {
    console.error("[DashboardSnapshot] deposit_domain gateway tx error:", gatewayDepositTxsRes.error);
  }

  const manualTxs = manualPanelTxsRes.data || [];
  const transferTxs = transferTxsRes.data || [];
  const gatewayDepositTxs = gatewayDepositTxsRes.data || [];

  const adminCommissionMap = {
    admin: {
      day: commissionSummary.day,
      week: commissionSummary.week,
      month: commissionSummary.month,
    },
    total: {
      day: commissionSummary.dayTotal,
      week: commissionSummary.weekTotal,
      month: commissionSummary.monthTotal,
    },
    tournamentTotal: {
      day: commissionSummary.dayTournamentTotal,
      week: commissionSummary.weekTournamentTotal,
      month: commissionSummary.monthTournamentTotal,
    },
    tournament: {
      day: commissionSummary.dayTournament,
      week: commissionSummary.weekTournament,
      month: commissionSummary.monthTournament,
    },
  };

  const adminGuaranteeMap = {
    day: guaranteeSummary.day,
    week: guaranteeSummary.week,
    month: guaranteeSummary.month,
  };

  const depositsFor = (startIso: string) => {
    const manual = sumRowsSince(manualTxs, startIso, (t) =>
      String((t as { type?: string }).type) === "deposit"
        ? Number((t as { amount?: number }).amount || 0)
        : 0
    );
    const transfer = sumRowsSince(transferTxs, startIso, (t) =>
      String(((t as { meta?: { action?: string } }).meta as { action?: string })?.action ?? "") ===
      "deposit"
        ? Number((t as { amount?: number }).amount || 0)
        : 0
    );
    return manual + transfer;
  };

  const withdrawalsFor = (startIso: string) => {
    const manual = sumRowsSince(manualTxs, startIso, (t) =>
      String((t as { type?: string }).type) === "withdraw"
        ? Number((t as { amount?: number }).amount || 0)
        : 0
    );
    const transfer = sumRowsSince(transferTxs, startIso, (t) =>
      String(((t as { meta?: { action?: string } }).meta as { action?: string })?.action ?? "") ===
      "withdraw"
        ? Number((t as { amount?: number }).amount || 0)
        : 0
    );
    return manual + transfer;
  };

  const summaries: Record<DashboardPeriod, FinancialSummary> = {
    day: { ...DEFAULT_SUMMARIES.day },
    week: { ...DEFAULT_SUMMARIES.week },
    month: { ...DEFAULT_SUMMARIES.month },
  };

  for (const [period, startIso] of [
    ["day", dayIso],
    ["week", weekIso],
    ["month", monthIso],
  ] as Array<[DashboardPeriod, string]>) {
    const commission =
      startIso === dayIso
        ? adminCommissionMap.admin.day
        : startIso === weekIso
        ? adminCommissionMap.admin.week
        : adminCommissionMap.admin.month;
    const commissionBase =
      startIso === dayIso
        ? adminCommissionMap.total.day
        : startIso === weekIso
        ? adminCommissionMap.total.week
        : adminCommissionMap.total.month;
    const tournamentCommissionBase =
      startIso === dayIso
        ? adminCommissionMap.tournamentTotal.day
        : startIso === weekIso
        ? adminCommissionMap.tournamentTotal.week
        : adminCommissionMap.tournamentTotal.month;
    const tournamentCommission =
      startIso === dayIso
        ? adminCommissionMap.tournament.day
        : startIso === weekIso
        ? adminCommissionMap.tournament.week
        : adminCommissionMap.tournament.month;
    const deposits = depositsFor(startIso);
    const withdrawals = withdrawalsFor(startIso);
    const gatewayPurchases = sumGatewayPurchasesSince(gatewayDepositTxs, startIso);

    summaries[period] = {
      period,
      ticketsVolume: commission,
      ticketsVolumeTotal: commissionBase,
      tournamentTicketsVolumeTotal: tournamentCommissionBase,
      tournamentCommission,
      tournamentGuaranteePayout: adminGuaranteeMap[period],
      gatewayPurchases,
      deposits,
      withdrawals,
      net: deposits - withdrawals,
    };
  }

  return {
    user,
    summaries,
  };
}
