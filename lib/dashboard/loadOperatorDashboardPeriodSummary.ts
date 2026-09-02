import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardPeriod, FinancialSummary } from "@/src/types/dashboard";
import { loadPerformanceDailyStatsSum } from "@/lib/dashboard/loadPerformanceDailyStatsSum";
import {
  loadPerformanceLifetimeStats,
  type PerformanceLifetimeRole,
} from "@/lib/dashboard/loadPerformanceLifetimeStats";
import { loadOperatorCommissionSummaryRange } from "@/lib/dashboard/loadOperatorCommissionSummary";
import {
  loadOperatorPlayerGamePerformanceByPeriod,
  loadOperatorPlayerGamePerformanceInRange,
} from "@/lib/dashboard/loadOperatorPlayerGamePerformance";
import {
  getOpenTehranAccountingWindow,
  getTehranWeekClosedPeriodIsoBounds,
  getTehranSnapshotDateRangeFromBounds,
  getTehranClosedPeriodIsoBounds,
  toInclusiveEndIso,
} from "@/lib/dashboard/tehranAccountingWindow";

type OperatorRole = "agent" | "super";

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

function toSummaryFromParts(params: {
  period: DashboardPeriod;
  earned: number;
  base: number;
  tournamentEarned: number;
  tournamentBase: number;
  deposits: number;
  withdrawals: number;
  playerWinnings: number;
  playerPurchases: number;
}): FinancialSummary {
  return {
    period: params.period,
    ticketsVolume: params.earned,
    ticketsVolumeTotal: params.base,
    tournamentTicketsVolumeTotal: params.tournamentBase,
    tournamentCommission: params.tournamentEarned,
    directPlayerCommission: 0,
    tournamentGuaranteePayout: 0,
    gatewayPurchases: 0,
    deposits: params.deposits,
    withdrawals: params.withdrawals,
    net: params.deposits - params.withdrawals,
    playerWinnings: params.playerWinnings,
    playerPurchases: params.playerPurchases,
  };
}

async function loadOperatorDepositsWithdrawals(params: {
  supabase: SupabaseClient;
  actorUserId: string;
  fromIso: string;
  toInclusiveIso: string;
}): Promise<{ deposits: number; withdrawals: number }> {
  const [manualPanelTxsRes, transferTxsRes] = await Promise.all([
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
  ]);

  if (manualPanelTxsRes.error) {
    console.error("[DashboardSnapshot] operator manual_panel tx error:", manualPanelTxsRes.error);
  }
  if (transferTxsRes.error) {
    console.error("[DashboardSnapshot] operator admin_panel_transfer tx error:", transferTxsRes.error);
  }

  const sumInRange = (
    rows: unknown[],
    pick: (row: Record<string, unknown>) => number
  ): number =>
    (rows || []).reduce((sum: number, row) => {
      const createdAt = String((row as { created_at?: string }).created_at ?? "");
      if (!createdAt || createdAt < params.fromIso || createdAt > params.toInclusiveIso) {
        return sum;
      }
      return sum + pick(row as Record<string, unknown>);
    }, 0);

  const manualTxs = manualPanelTxsRes.data || [];
  const transferTxs = transferTxsRes.data || [];

  const deposits =
    sumInRange(manualTxs, (t) =>
      String(t.type) === "deposit" ? Number(t.amount || 0) : 0
    ) +
    sumInRange(transferTxs, (t) =>
      String((t.meta as { action?: string })?.action ?? "") === "deposit"
        ? Number(t.amount || 0)
        : 0
    );

  const withdrawals =
    sumInRange(manualTxs, (t) =>
      String(t.type) === "withdraw" ? Number(t.amount || 0) : 0
    ) +
    sumInRange(transferTxs, (t) =>
      String((t.meta as { action?: string })?.action ?? "") === "withdraw"
        ? Number(t.amount || 0)
        : 0
    );

  return { deposits, withdrawals };
}

async function loadOperatorClosedSnapshotSummary(params: {
  supabase: SupabaseClient;
  operatorId: string;
  role: OperatorRole;
  period: Exclude<DashboardPeriod, "overall">;
  fromSnapshotDate: string;
  throughSnapshotDate: string;
  fromIso: string;
  toExclusiveIso: string;
}): Promise<FinancialSummary> {
  const toInclusiveIso = toInclusiveEndIso(params.toExclusiveIso);
  const lifetimeRole: PerformanceLifetimeRole = params.role;

  const [dailySum, commission, playerGame] = await Promise.all([
    loadPerformanceDailyStatsSum({
      userId: params.operatorId,
      role: lifetimeRole,
      fromSnapshotDate: params.fromSnapshotDate,
      throughSnapshotDate: params.throughSnapshotDate,
    }),
    loadOperatorCommissionSummaryRange({
      supabase: params.supabase,
      userId: params.operatorId,
      role: params.role,
      fromIso: params.fromIso,
      toIso: toInclusiveIso,
    }),
    loadOperatorPlayerGamePerformanceInRange({
      operatorId: params.operatorId,
      role: params.role,
      fromIso: params.fromIso,
      toIso: toInclusiveIso,
    }),
  ]);

  console.log("[DashboardSnapshot] operator closed period loaded", {
    period: params.period,
    role: params.role,
    fromSnapshotDate: params.fromSnapshotDate,
    throughSnapshotDate: params.throughSnapshotDate,
    source: "performance_daily_stats",
  });

  return toSummaryFromParts({
    period: params.period,
    earned: dailySum.commission,
    base: dailySum.commissionTotal ?? 0,
    tournamentEarned: commission.tournamentEarnedAmount,
    tournamentBase: commission.tournamentCommissionBase,
    deposits: dailySum.deposits,
    withdrawals: dailySum.withdrawals,
    playerWinnings: playerGame.playerWinnings,
    playerPurchases: playerGame.playerPurchases,
  });
}

/** Live day tab: open Tehran 08:00 → now. */
export async function loadOperatorLiveDaySummary(params: {
  supabase: SupabaseClient;
  operatorId: string;
  role: OperatorRole;
}): Promise<FinancialSummary> {
  const { fromIso, toIso } = getOpenTehranAccountingWindow();

  console.log("[DashboardSnapshot] operator live day window", {
    fromIso,
    toIso,
    source: "tehran_08:00",
  });

  const [commission, playerGame, money] = await Promise.all([
    loadOperatorCommissionSummaryRange({
      supabase: params.supabase,
      userId: params.operatorId,
      role: params.role,
      fromIso,
      toIso,
    }),
    loadOperatorPlayerGamePerformanceInRange({
      operatorId: params.operatorId,
      role: params.role,
      fromIso,
      toIso,
    }),
    loadOperatorDepositsWithdrawals({
      supabase: params.supabase,
      actorUserId: params.operatorId,
      fromIso,
      toInclusiveIso: toIso,
    }),
  ]);

  return toSummaryFromParts({
    period: "day",
    earned: commission.earnedAmount,
    base: commission.commissionBase,
    tournamentEarned: commission.tournamentEarnedAmount,
    tournamentBase: commission.tournamentCommissionBase,
    deposits: money.deposits,
    withdrawals: money.withdrawals,
    playerWinnings: playerGame.playerWinnings,
    playerPurchases: playerGame.playerPurchases,
  });
}

export async function loadOperatorWeekSnapshotSummary(params: {
  supabase: SupabaseClient;
  operatorId: string;
  role: OperatorRole;
}): Promise<FinancialSummary> {
  const weekBounds = getTehranWeekClosedPeriodIsoBounds();
  if (!weekBounds) {
    return EMPTY_SUMMARY("week");
  }

  return loadOperatorClosedSnapshotSummary({
    supabase: params.supabase,
    operatorId: params.operatorId,
    role: params.role,
    period: "week",
    fromSnapshotDate: weekBounds.fromSnapshotDate,
    throughSnapshotDate: weekBounds.throughSnapshotDate,
    fromIso: weekBounds.fromIso,
    toExclusiveIso: weekBounds.toExclusiveIso,
  });
}

export async function loadOperatorRangeSnapshotSummary(params: {
  supabase: SupabaseClient;
  operatorId: string;
  role: OperatorRole;
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

  return loadOperatorClosedSnapshotSummary({
    supabase: params.supabase,
    operatorId: params.operatorId,
    role: params.role,
    period: "week",
    fromSnapshotDate: bounds.fromSnapshotDate,
    throughSnapshotDate: bounds.throughSnapshotDate,
    fromIso: isoBounds.fromIso,
    toExclusiveIso: isoBounds.toExclusiveIso,
  });
}

/** Closed overall metrics through last snapshot + all-time downline player stats. */
export async function loadOperatorOverallSnapshotSummary(params: {
  operatorId: string;
  role: OperatorRole;
}): Promise<FinancialSummary> {
  const lifetimeRole: PerformanceLifetimeRole = params.role;

  const [lifetime, playerGame] = await Promise.all([
    loadPerformanceLifetimeStats({
      userId: params.operatorId,
      role: lifetimeRole,
    }),
    loadOperatorPlayerGamePerformanceByPeriod({
      operatorId: params.operatorId,
      role: params.role,
    }),
  ]);

  return toSummaryFromParts({
    period: "overall",
    earned: lifetime.commission,
    base: lifetime.commissionTotal ?? 0,
    tournamentEarned: 0,
    tournamentBase: 0,
    deposits: lifetime.deposits,
    withdrawals: lifetime.withdrawals,
    playerWinnings: playerGame.overall.playerWinnings,
    playerPurchases: playerGame.overall.playerPurchases,
  });
}
