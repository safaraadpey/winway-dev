import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardPeriod, FinancialSummary } from "@/src/types/dashboard";
import { getAdminZeroUserOrNull } from "@/lib/featureFlags/adminZero";
import { pgPool } from "@/lib/pg";
import { sumGatewayPurchasesInRange } from "@/lib/dashboard/gatewayPurchases";
import { loadPanelCommissionBreakdownInRange } from "@/lib/dashboard/loadPanelCommissionBreakdown";
import {
  getOpenTehranAccountingWindow,
  getTehranClosedPeriodIsoBounds,
  getTehranSnapshotDateRangeFromBounds,
  getTehranWeekClosedPeriodIsoBounds,
  getTehranWeekSnapshotDateRange,
  toInclusiveEndIso,
} from "@/lib/dashboard/tehranAccountingWindow";

type AdminCommissionRangeRow = {
  amount: number;
  total: number;
  tournamentAmount: number;
  tournamentTotal: number;
  directAmount: number;
};

type AdminClosedStatsRow = {
  admin_amount: string | number | null;
  ticket_commission_base: string | number | null;
  tournament_commission_base: string | number | null;
  direct_player_amount: string | number | null;
  guarantee_topup: string | number | null;
};

function toAmount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function sumRowsInRange(
  rows: unknown[],
  fromIso: string,
  toInclusiveIso: string,
  pick: (row: unknown) => number
): number {
  return (rows || []).reduce((sum: number, row: unknown) => {
    const createdAt = String((row as { created_at?: string }).created_at ?? "");
    if (!createdAt || createdAt < fromIso || createdAt > toInclusiveIso) return sum;
    return sum + pick(row);
  }, 0);
}

async function fetchAdminCommissionSummaryRange(
  supabase: SupabaseClient,
  fromIso: string,
  toInclusiveIso: string
): Promise<AdminCommissionRangeRow> {
  const { data, error } = await supabase.rpc("fn_dashboard_admin_commission_summary_range", {
    p_from: fromIso,
    p_to: toInclusiveIso,
  });
  if (error) {
    throw new Error(error.message || "Failed to load admin commission range");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Empty admin commission range");
  }
  return {
    amount: toAmount((row as { amount?: number }).amount),
    total: toAmount((row as { total?: number }).total),
    tournamentAmount: toAmount((row as { tournament_amount?: number }).tournament_amount),
    tournamentTotal: toAmount((row as { tournament_total?: number }).tournament_total),
    directAmount: toAmount((row as { direct_amount?: number }).direct_amount),
  };
}

async function fetchAdminGuaranteeSummaryRange(
  supabase: SupabaseClient,
  fromIso: string,
  toInclusiveIso: string
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "fn_dashboard_admin_tournament_guarantee_summary_range",
    {
      p_from: fromIso,
      p_to: toInclusiveIso,
    }
  );
  if (error) {
    throw new Error(error.message || "Failed to load admin tournament guarantee range");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Empty admin tournament guarantee range");
  }
  return toAmount((row as { amount?: number }).amount);
}

async function loadAdminClosedStatsFromSnapshot(params: {
  adminZeroId: string;
  fromSnapshotDate: string;
  throughSnapshotDate: string;
}): Promise<AdminClosedStatsRow | null> {
  if (!pgPool) {
    console.error("[DashboardSnapshot] skipped closed stats: no PostgreSQL pool");
    return null;
  }
  try {
    const result = await pgPool.query<AdminClosedStatsRow>(
      `
      SELECT
        COALESCE(SUM(d.admin_amount), 0) AS admin_amount,
        COALESCE(SUM(d.ticket_commission_base), 0) AS ticket_commission_base,
        COALESCE(SUM(d.tournament_commission_base), 0) AS tournament_commission_base,
        COALESCE(SUM(d.direct_player_amount), 0) AS direct_player_amount,
        COALESCE(SUM(d.guarantee_topup), 0) AS guarantee_topup
      FROM public.performance_daily_stats d
      WHERE d.user_id = $1::uuid
        AND d.role = 'admin'
        AND d.snapshot_date >= $2::date
        AND d.snapshot_date <= $3::date
      `,
      [params.adminZeroId, params.fromSnapshotDate, params.throughSnapshotDate]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    console.error("[DashboardSnapshot] closed stats query failed:", error);
    return null;
  }
}

async function loadAdminDepositsWithdrawalsGateway(params: {
  supabase: SupabaseClient;
  actorUserId: string;
  fromIso: string;
  toInclusiveIso: string;
}): Promise<{ deposits: number; withdrawals: number; gatewayPurchases: number }> {
  const [manualPanelTxsRes, transferTxsRes, gatewayDepositTxsRes] = await Promise.all([
    params.supabase
      .from("transactions")
      .select("amount, type, created_at")
      .eq("source_kind", "manual_panel")
      .eq("source_ref", params.actorUserId)
      .in("type", ["deposit", "withdraw"])
      .gte("created_at", params.fromIso)
      .lte("created_at", params.toInclusiveIso),
    params.supabase
      .from("transactions")
      .select("amount, meta, created_at")
      .eq("source_kind", "admin_panel_transfer")
      .eq("type", "transfer_out")
      .filter("meta->>actor_id", "eq", params.actorUserId)
      .gte("created_at", params.fromIso)
      .lte("created_at", params.toInclusiveIso),
    params.supabase
      .from("transactions")
      .select("amount, created_at, idempotency_key")
      .eq("source_kind", "deposit_domain")
      .eq("type", "deposit")
      .gte("created_at", params.fromIso)
      .lte("created_at", params.toInclusiveIso),
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

  const deposits =
    sumRowsInRange(manualTxs, params.fromIso, params.toInclusiveIso, (t) =>
      String((t as { type?: string }).type) === "deposit"
        ? toAmount((t as { amount?: number }).amount)
        : 0
    ) +
    sumRowsInRange(transferTxs, params.fromIso, params.toInclusiveIso, (t) =>
      String(((t as { meta?: { action?: string } }).meta as { action?: string })?.action ?? "") ===
      "deposit"
        ? toAmount((t as { amount?: number }).amount)
        : 0
    );

  const withdrawals =
    sumRowsInRange(manualTxs, params.fromIso, params.toInclusiveIso, (t) =>
      String((t as { type?: string }).type) === "withdraw"
        ? toAmount((t as { amount?: number }).amount)
        : 0
    ) +
    sumRowsInRange(transferTxs, params.fromIso, params.toInclusiveIso, (t) =>
      String(((t as { meta?: { action?: string } }).meta as { action?: string })?.action ?? "") ===
      "withdraw"
        ? toAmount((t as { amount?: number }).amount)
        : 0
    );

  const gatewayPurchases = sumGatewayPurchasesInRange(
    gatewayDepositTxs,
    params.fromIso,
    params.toInclusiveIso
  );

  return { deposits, withdrawals, gatewayPurchases };
}

const EMPTY_SUMMARY = (period: Exclude<DashboardPeriod, "overall">): FinancialSummary => ({
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

async function loadAdminClosedSnapshotSummary(params: {
  supabase: SupabaseClient;
  actorUserId: string;
  adminZeroId: string;
  period: Exclude<DashboardPeriod, "overall">;
  fromSnapshotDate: string;
  throughSnapshotDate: string;
  fromIso: string;
  toExclusiveIso: string;
}): Promise<FinancialSummary> {
  const toInclusiveIso = toInclusiveEndIso(params.toExclusiveIso);

  const [closedStats, commissionRange, panelOperators, money] = await Promise.all([
    loadAdminClosedStatsFromSnapshot({
      adminZeroId: params.adminZeroId,
      fromSnapshotDate: params.fromSnapshotDate,
      throughSnapshotDate: params.throughSnapshotDate,
    }),
    fetchAdminCommissionSummaryRange(params.supabase, params.fromIso, toInclusiveIso),
    loadPanelCommissionBreakdownInRange(params.fromIso, toInclusiveIso, params.supabase),
    loadAdminDepositsWithdrawalsGateway({
      supabase: params.supabase,
      actorUserId: params.actorUserId,
      fromIso: params.fromIso,
      toInclusiveIso,
    }),
  ]);

  if (!closedStats) {
    return EMPTY_SUMMARY(params.period);
  }

  const ticketBase = toAmount(closedStats.ticket_commission_base);
  const tournamentBase = toAmount(closedStats.tournament_commission_base);

  console.log("[DashboardSnapshot] closed period loaded", {
    period: params.period,
    fromSnapshotDate: params.fromSnapshotDate,
    throughSnapshotDate: params.throughSnapshotDate,
    source: "performance_daily_stats",
  });

  return {
    period: params.period,
    ticketsVolume: toAmount(closedStats.admin_amount),
    ticketsVolumeTotal: ticketBase + tournamentBase,
    tournamentTicketsVolumeTotal: tournamentBase,
    tournamentCommission: commissionRange.tournamentAmount,
    directPlayerCommission: toAmount(closedStats.direct_player_amount),
    tournamentGuaranteePayout: toAmount(closedStats.guarantee_topup),
    gatewayPurchases: money.gatewayPurchases,
    deposits: money.deposits,
    withdrawals: money.withdrawals,
    net: money.deposits - money.withdrawals,
    panelOperators,
  };
}

export async function loadAdminLiveDaySummary(params: {
  supabase: SupabaseClient;
  actorUserId: string;
}): Promise<FinancialSummary> {
  const { fromIso, toIso } = getOpenTehranAccountingWindow();

  console.log("[DashboardSnapshot] live day window", {
    fromIso,
    toIso,
    source: "tehran_08:00",
  });

  const [commission, guarantee, panelOperators, money] = await Promise.all([
    fetchAdminCommissionSummaryRange(params.supabase, fromIso, toIso),
    fetchAdminGuaranteeSummaryRange(params.supabase, fromIso, toIso),
    loadPanelCommissionBreakdownInRange(fromIso, toIso, params.supabase),
    loadAdminDepositsWithdrawalsGateway({
      supabase: params.supabase,
      actorUserId: params.actorUserId,
      fromIso,
      toInclusiveIso: toIso,
    }),
  ]);

  return {
    period: "day",
    ticketsVolume: commission.amount,
    ticketsVolumeTotal: commission.total,
    tournamentTicketsVolumeTotal: commission.tournamentTotal,
    tournamentCommission: commission.tournamentAmount,
    directPlayerCommission: commission.directAmount,
    tournamentGuaranteePayout: guarantee,
    gatewayPurchases: money.gatewayPurchases,
    deposits: money.deposits,
    withdrawals: money.withdrawals,
    net: money.deposits - money.withdrawals,
    panelOperators,
  };
}

export async function loadAdminWeekSnapshotSummary(params: {
  supabase: SupabaseClient;
  actorUserId: string;
}): Promise<FinancialSummary> {
  const adminZero = await getAdminZeroUserOrNull();
  const adminZeroId = adminZero?.id ?? params.actorUserId;
  const weekBounds = getTehranWeekClosedPeriodIsoBounds();
  if (!weekBounds) {
    return EMPTY_SUMMARY("week");
  }

  return loadAdminClosedSnapshotSummary({
    supabase: params.supabase,
    actorUserId: params.actorUserId,
    adminZeroId,
    period: "week",
    fromSnapshotDate: weekBounds.fromSnapshotDate,
    throughSnapshotDate: weekBounds.throughSnapshotDate,
    fromIso: weekBounds.fromIso,
    toExclusiveIso: weekBounds.toExclusiveIso,
  });
}

export async function loadAdminRangeSnapshotSummary(params: {
  supabase: SupabaseClient;
  actorUserId: string;
  fromDate: string;
  toDate: string;
}): Promise<FinancialSummary | null> {
  const bounds = getTehranSnapshotDateRangeFromBounds(params.fromDate, params.toDate);
  if (!bounds) return null;

  const isoBounds = getTehranClosedPeriodIsoBounds(
    bounds.fromSnapshotDate,
    bounds.throughSnapshotDate
  );
  if (!isoBounds) return null;

  const adminZero = await getAdminZeroUserOrNull();
  const adminZeroId = adminZero?.id ?? params.actorUserId;

  const summary = await loadAdminClosedSnapshotSummary({
    supabase: params.supabase,
    actorUserId: params.actorUserId,
    adminZeroId,
    period: "week",
    fromSnapshotDate: bounds.fromSnapshotDate,
    throughSnapshotDate: bounds.throughSnapshotDate,
    fromIso: isoBounds.fromIso,
    toExclusiveIso: isoBounds.toExclusiveIso,
  });

  return summary;
}

export function getAdminWeekSnapshotMeta() {
  return getTehranWeekSnapshotDateRange();
}
