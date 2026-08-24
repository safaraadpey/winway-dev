import type { SupabaseClient } from "@supabase/supabase-js";

export type CommissionDailySourceKind = "ticket" | "tournament";
export type CommissionOperatorRole = "agent" | "super";

export type CommissionDailyStatRow = {
  stat_date: string;
  source_kind: CommissionDailySourceKind;
  earned_amount: number | string;
  commission_base: number | string;
};

export type CommissionDailyTotals = {
  earnedAmount: number;
  commissionBase: number;
  ticketEarnedAmount: number;
  ticketCommissionBase: number;
  tournamentEarnedAmount: number;
  tournamentCommissionBase: number;
};

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function sumCommissionDailyRows(
  rows: CommissionDailyStatRow[],
  options?: {
    fromDate?: string | null;
    toDate?: string | null;
    sourceKind?: CommissionDailySourceKind | null;
  }
): CommissionDailyTotals {
  const fromDate = options?.fromDate ?? null;
  const toDate = options?.toDate ?? null;
  const sourceKind = options?.sourceKind ?? null;

  let earnedAmount = 0;
  let commissionBase = 0;
  let ticketEarnedAmount = 0;
  let ticketCommissionBase = 0;
  let tournamentEarnedAmount = 0;
  let tournamentCommissionBase = 0;

  for (const row of rows) {
    if (fromDate && row.stat_date < fromDate) continue;
    if (toDate && row.stat_date > toDate) continue;
    if (sourceKind && row.source_kind !== sourceKind) continue;

    const earned = toNumber(row.earned_amount);
    const base = toNumber(row.commission_base);

    earnedAmount += earned;
    commissionBase += base;

    if (row.source_kind === "ticket") {
      ticketEarnedAmount += earned;
      ticketCommissionBase += base;
    } else {
      tournamentEarnedAmount += earned;
      tournamentCommissionBase += base;
    }
  }

  return {
    earnedAmount,
    commissionBase,
    ticketEarnedAmount,
    ticketCommissionBase,
    tournamentEarnedAmount,
    tournamentCommissionBase,
  };
}

export function dateIsoFromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Rolling 7×24h window ending at request time. */
export const ROLLING_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Rolling 30×24h window ending at request time. */
export const ROLLING_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function getRollingWeekStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - ROLLING_WEEK_MS);
}

export function getRollingMonthStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - ROLLING_MONTH_MS);
}

/** Matches commission_daily_stats.stat_date bucketing (UTC calendar day). */
export function getUtcPeriodStart(period: "day" | "week" | "month"): Date {
  const now = new Date();

  if (period === "day") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  if (period === "week") {
    return getRollingWeekStart(now);
  }

  return getRollingMonthStart(now);
}

export function commissionStatFromDateForPeriod(
  period: "day" | "week" | "month" | "overall"
): string | null {
  if (period === "overall") return null;
  return dateIsoFromUtcDate(getUtcPeriodStart(period));
}

export async function loadCommissionDailyStatRows(params: {
  supabase: SupabaseClient;
  userId: string;
  role: CommissionOperatorRole;
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<CommissionDailyStatRow[]> {
  return loadCommissionDailyStatRowsFromSupabase(params);
}

async function loadCommissionDailyStatRowsFromSupabase(params: {
  supabase: SupabaseClient;
  userId: string;
  role: CommissionOperatorRole;
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<CommissionDailyStatRow[]> {
  let query = params.supabase
    .from("commission_daily_stats")
    .select("stat_date, source_kind, earned_amount, commission_base")
    .eq("user_id", params.userId)
    .eq("role", params.role);

  if (params.fromDate) {
    query = query.gte("stat_date", params.fromDate);
  }
  if (params.toDate) {
    query = query.lte("stat_date", params.toDate);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[Commission] commission_daily_stats read error:", error.message);
    return [];
  }

  return (data || []) as CommissionDailyStatRow[];
}

export async function loadCommissionDailyTotals(params: {
  supabase: SupabaseClient;
  userId: string;
  role: CommissionOperatorRole;
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<CommissionDailyTotals> {
  const rows = await loadCommissionDailyStatRows(params);
  return sumCommissionDailyRows(rows, {
    fromDate: params.fromDate,
    toDate: params.toDate,
  });
}

export type PanelOperatorDailyRow = {
  user_id: string;
  role: CommissionOperatorRole;
  stat_date: string;
  earned_amount: number | string;
};

export async function loadPanelOperatorDailyRows(params: {
  supabase: SupabaseClient;
  fromDate: string;
  toDate?: string | null;
}): Promise<PanelOperatorDailyRow[]> {
  return loadPanelOperatorDailyRowsFromSupabase(params);
}

async function loadPanelOperatorDailyRowsFromSupabase(params: {
  supabase: SupabaseClient;
  fromDate: string;
  toDate?: string | null;
}): Promise<PanelOperatorDailyRow[]> {
  let query = params.supabase
    .from("commission_daily_stats")
    .select("user_id, role, stat_date, earned_amount")
    .gte("stat_date", params.fromDate)
    .gt("earned_amount", 0);

  if (params.toDate) {
    query = query.lte("stat_date", params.toDate);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[Commission] panel operator daily stats read error:", error.message);
    return [];
  }

  return (data || []) as PanelOperatorDailyRow[];
}
