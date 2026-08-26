import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommissionDailyTotals,
  CommissionOperatorRole,
} from "@/lib/dashboard/loadCommissionDailyStats";

export function emptyCommissionTotals(): CommissionDailyTotals {
  return {
    earnedAmount: 0,
    commissionBase: 0,
    ticketEarnedAmount: 0,
    ticketCommissionBase: 0,
    tournamentEarnedAmount: 0,
    tournamentCommissionBase: 0,
  };
}

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function totalsFromParts(
  earned: number,
  base: number,
  tournamentEarned: number,
  tournamentBase: number
): CommissionDailyTotals {
  return {
    earnedAmount: earned,
    commissionBase: base,
    ticketEarnedAmount: Math.max(0, earned - tournamentEarned),
    ticketCommissionBase: Math.max(0, base - tournamentBase),
    tournamentEarnedAmount: tournamentEarned,
    tournamentCommissionBase: tournamentBase,
  };
}

export type OperatorPeriodCommissionMap = {
  day: CommissionDailyTotals;
  week: CommissionDailyTotals;
  month: CommissionDailyTotals;
};

type SummaryRow = {
  day_earned?: number | string;
  week_earned?: number | string;
  month_earned?: number | string;
  day_base?: number | string;
  week_base?: number | string;
  month_base?: number | string;
  day_tournament_earned?: number | string;
  week_tournament_earned?: number | string;
  month_tournament_earned?: number | string;
  day_tournament_base?: number | string;
  week_tournament_base?: number | string;
  month_tournament_base?: number | string;
};

type RangeRow = {
  earned?: number | string;
  base?: number | string;
  tournament_earned?: number | string;
  tournament_base?: number | string;
};

export async function loadOperatorPeriodCommissionSummary(params: {
  supabase: SupabaseClient;
  userId: string;
  role: CommissionOperatorRole;
}): Promise<OperatorPeriodCommissionMap> {
  const empty = {
    day: emptyCommissionTotals(),
    week: emptyCommissionTotals(),
    month: emptyCommissionTotals(),
  };

  const { data, error } = await params.supabase.rpc(
    "fn_dashboard_operator_commission_summary",
    {
      p_user_id: params.userId,
      p_role: params.role,
    }
  );

  if (error) {
    console.error("[Dashboard] operator commission summary error:", error.message);
    return empty;
  }

  const row = (Array.isArray(data) ? data[0] : data) as SummaryRow | null;
  if (!row) return empty;

  const dayTourEarned = toNumber(row.day_tournament_earned);
  const weekTourEarned = toNumber(row.week_tournament_earned);
  const monthTourEarned = toNumber(row.month_tournament_earned);
  const dayTourBase = toNumber(row.day_tournament_base);
  const weekTourBase = toNumber(row.week_tournament_base);
  const monthTourBase = toNumber(row.month_tournament_base);

  return {
    day: totalsFromParts(
      toNumber(row.day_earned),
      toNumber(row.day_base),
      dayTourEarned,
      dayTourBase
    ),
    week: totalsFromParts(
      toNumber(row.week_earned),
      toNumber(row.week_base),
      weekTourEarned,
      weekTourBase
    ),
    month: totalsFromParts(
      toNumber(row.month_earned),
      toNumber(row.month_base),
      monthTourEarned,
      monthTourBase
    ),
  };
}

export async function loadOperatorCommissionSummaryRange(params: {
  supabase: SupabaseClient;
  userId: string;
  role: CommissionOperatorRole;
  fromIso: string;
  toIso: string;
}): Promise<CommissionDailyTotals> {
  const { data, error } = await params.supabase.rpc(
    "fn_dashboard_operator_commission_summary_range",
    {
      p_user_id: params.userId,
      p_role: params.role,
      p_from: params.fromIso,
      p_to: params.toIso,
    }
  );

  if (error) {
    console.error("[Dashboard] operator commission range error:", error.message);
    return emptyCommissionTotals();
  }

  const row = (Array.isArray(data) ? data[0] : data) as RangeRow | null;
  if (!row) return emptyCommissionTotals();

  return totalsFromParts(
    toNumber(row.earned),
    toNumber(row.base),
    toNumber(row.tournament_earned),
    toNumber(row.tournament_base)
  );
}
