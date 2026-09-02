import { pgPool } from "@/lib/pg";
import type { PerformanceLifetimeRole, PerformanceLifetimeStats } from "@/lib/dashboard/loadPerformanceLifetimeStats";

type DailySumRow = {
  from_snapshot_date: string | null;
  through_snapshot_date: string | null;
  games_played: number | string | null;
  line_wins_count: number | string | null;
  full_wins_count: number | string | null;
  player_winnings: number | string | null;
  cards_amount: number | string | null;
  player_commission_amount: number | string | null;
  player_commission_base: number | string | null;
  agent_amount: number | string | null;
  super_amount: number | string | null;
  admin_amount: number | string | null;
  direct_player_amount: number | string | null;
  ticket_commission_base: number | string | null;
  tournament_commission_base: number | string | null;
  gateway_deposits: number | string | null;
  crypto_deposits: number | string | null;
  panel_deposits: number | string | null;
  panel_withdrawals: number | string | null;
  approved_withdrawals: number | string | null;
};

function toAmount(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function emptyAggregate(): PerformanceLifetimeStats {
  return {
    throughSnapshotDate: null,
    gamesPlayed: 0,
    lineWins: 0,
    fullWins: 0,
    playerWinnings: 0,
    playerPurchases: 0,
    commission: 0,
    commissionTotal: null,
    deposits: 0,
    withdrawals: 0,
    net: 0,
  };
}

function mapDailySumRow(role: PerformanceLifetimeRole, row: DailySumRow): PerformanceLifetimeStats {
  const deposits =
    toAmount(row.gateway_deposits) + toAmount(row.crypto_deposits) + toAmount(row.panel_deposits);
  const withdrawals = toAmount(row.panel_withdrawals) + toAmount(row.approved_withdrawals);
  const throughSnapshotDate = row.through_snapshot_date;

  if (role === "player") {
    return {
      throughSnapshotDate,
      gamesPlayed: toAmount(row.games_played),
      lineWins: toAmount(row.line_wins_count),
      fullWins: toAmount(row.full_wins_count),
      playerWinnings: toAmount(row.player_winnings),
      playerPurchases: toAmount(row.cards_amount),
      commission: toAmount(row.player_commission_amount),
      commissionTotal: toAmount(row.player_commission_base),
      deposits,
      withdrawals,
      net: deposits - withdrawals,
    };
  }

  if (role === "admin") {
    const commission = toAmount(row.admin_amount);
    const commissionBase = toAmount(row.ticket_commission_base);
    const direct = toAmount(row.direct_player_amount);
    return {
      throughSnapshotDate,
      gamesPlayed: 0,
      lineWins: 0,
      fullWins: 0,
      playerWinnings: 0,
      playerPurchases: 0,
      commission,
      commissionTotal: commissionBase + direct,
      deposits,
      withdrawals,
      net: deposits - withdrawals,
    };
  }

  const commission =
    role === "agent" ? toAmount(row.agent_amount) : toAmount(row.super_amount);
  const commissionBase =
    toAmount(row.ticket_commission_base) + toAmount(row.tournament_commission_base);

  return {
    throughSnapshotDate,
    gamesPlayed: 0,
    lineWins: 0,
    fullWins: 0,
    playerWinnings: 0,
    playerPurchases: 0,
    commission,
    commissionTotal: commissionBase,
    deposits,
    withdrawals,
    net: deposits - withdrawals,
  };
}

/**
 * SUM(performance_daily_stats) for a closed snapshot_date range.
 * Source of truth: PostgreSQL.
 */
export async function loadPerformanceDailyStatsSum(params: {
  userId: string;
  role: PerformanceLifetimeRole;
  fromSnapshotDate: string;
  throughSnapshotDate: string;
}): Promise<PerformanceLifetimeStats> {
  const empty = emptyAggregate();
  if (!pgPool) {
    console.error("[PerformanceDaily] skipped: no PostgreSQL pool");
    return empty;
  }

  try {
    const result = await pgPool.query<DailySumRow>(
      `
      SELECT
        MIN(d.snapshot_date)::text AS from_snapshot_date,
        MAX(d.snapshot_date)::text AS through_snapshot_date,
        COALESCE(SUM(d.games_played), 0) AS games_played,
        COALESCE(SUM(d.line_wins_count), 0) AS line_wins_count,
        COALESCE(SUM(d.full_wins_count), 0) AS full_wins_count,
        COALESCE(SUM(d.player_winnings), 0) AS player_winnings,
        COALESCE(SUM(d.cards_amount), 0) AS cards_amount,
        COALESCE(SUM(d.player_commission_amount), 0) AS player_commission_amount,
        COALESCE(SUM(d.player_commission_base), 0) AS player_commission_base,
        COALESCE(SUM(d.agent_amount), 0) AS agent_amount,
        COALESCE(SUM(d.super_amount), 0) AS super_amount,
        COALESCE(SUM(d.admin_amount), 0) AS admin_amount,
        COALESCE(SUM(d.direct_player_amount), 0) AS direct_player_amount,
        COALESCE(SUM(d.ticket_commission_base), 0) AS ticket_commission_base,
        COALESCE(SUM(d.tournament_commission_base), 0) AS tournament_commission_base,
        COALESCE(SUM(d.gateway_deposits), 0) AS gateway_deposits,
        COALESCE(SUM(d.crypto_deposits), 0) AS crypto_deposits,
        COALESCE(SUM(d.panel_deposits), 0) AS panel_deposits,
        COALESCE(SUM(d.panel_withdrawals), 0) AS panel_withdrawals,
        COALESCE(SUM(d.approved_withdrawals), 0) AS approved_withdrawals
      FROM public.performance_daily_stats d
      WHERE d.user_id = $1::uuid
        AND d.role = $2::text
        AND d.snapshot_date >= $3::date
        AND d.snapshot_date <= $4::date
      `,
      [params.userId, params.role, params.fromSnapshotDate, params.throughSnapshotDate]
    );

    const row = result.rows[0];
    if (!row?.through_snapshot_date) {
      console.log("[PerformanceDaily] no rows in range", {
        userId: params.userId,
        role: params.role,
        fromSnapshotDate: params.fromSnapshotDate,
        throughSnapshotDate: params.throughSnapshotDate,
        source: "postgresql",
      });
      return empty;
    }

    const mapped = mapDailySumRow(params.role, row);
    console.log("[PerformanceDaily] loaded sum", {
      userId: params.userId,
      role: params.role,
      fromSnapshotDate: params.fromSnapshotDate,
      throughSnapshotDate: params.throughSnapshotDate,
      source: "postgresql",
    });
    return mapped;
  } catch (error) {
    console.error("[PerformanceDaily] query failed:", error);
    return empty;
  }
}
