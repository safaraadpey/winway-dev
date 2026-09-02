import { pgPool } from "@/lib/pg";

export type PerformanceLifetimeRole = "player" | "agent" | "super" | "admin";

export type PerformanceLifetimeStats = {
  throughSnapshotDate: string | null;
  gamesPlayed: number;
  lineWins: number;
  fullWins: number;
  playerWinnings: number;
  playerPurchases: number;
  commission: number;
  commissionTotal: number | null;
  deposits: number;
  withdrawals: number;
  net: number;
};

type LifetimeRow = {
  through_snapshot_date: string | null;
  games_played: number | string | null;
  line_wins_count: number | string | null;
  full_wins_count: number | string | null;
  player_winnings: number | string | null;
  tournament_winnings: number | string | null;
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

function emptyLifetimeStats(): PerformanceLifetimeStats {
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

function mapLifetimeRow(role: PerformanceLifetimeRole, row: LifetimeRow): PerformanceLifetimeStats {
  const deposits =
    toAmount(row.gateway_deposits) + toAmount(row.crypto_deposits) + toAmount(row.panel_deposits);
  const withdrawals = toAmount(row.panel_withdrawals) + toAmount(row.approved_withdrawals);

  if (role === "player") {
    return {
      throughSnapshotDate: row.through_snapshot_date,
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
      throughSnapshotDate: row.through_snapshot_date,
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
    throughSnapshotDate: row.through_snapshot_date,
    gamesPlayed: toAmount(row.games_played),
    lineWins: toAmount(row.line_wins_count),
    fullWins: toAmount(row.full_wins_count),
    playerWinnings: toAmount(row.player_winnings),
    playerPurchases: toAmount(row.cards_amount),
    commission,
    commissionTotal: commissionBase,
    deposits,
    withdrawals,
    net: deposits - withdrawals,
  };
}

/**
 * Closed overall metrics from performance_lifetime_stats (through last 08:00 Tehran window).
 * Source of truth: PostgreSQL.
 */
export async function loadPerformanceLifetimeStats(params: {
  userId: string;
  role: PerformanceLifetimeRole;
}): Promise<PerformanceLifetimeStats> {
  const empty = emptyLifetimeStats();
  if (!pgPool) {
    console.error("[PerformanceLifetime] skipped: no PostgreSQL pool");
    return empty;
  }

  try {
    const result = await pgPool.query<LifetimeRow>(
      `
      SELECT
        through_snapshot_date,
        games_played,
        line_wins_count,
        full_wins_count,
        player_winnings,
        tournament_winnings,
        cards_amount,
        player_commission_amount,
        player_commission_base,
        agent_amount,
        super_amount,
        admin_amount,
        direct_player_amount,
        ticket_commission_base,
        tournament_commission_base,
        gateway_deposits,
        crypto_deposits,
        panel_deposits,
        panel_withdrawals,
        approved_withdrawals
      FROM public.performance_lifetime_stats
      WHERE user_id = $1::uuid
        AND role = $2::text
      LIMIT 1
      `,
      [params.userId, params.role]
    );

    const row = result.rows[0];
    if (!row) {
      console.log("[PerformanceLifetime] no row", {
        userId: params.userId,
        role: params.role,
        source: "postgresql",
      });
      return empty;
    }

    const mapped = mapLifetimeRow(params.role, row);
    console.log("[PerformanceLifetime] loaded", {
      userId: params.userId,
      role: params.role,
      throughSnapshotDate: mapped.throughSnapshotDate,
      source: "postgresql",
    });
    return mapped;
  } catch (error) {
    console.error("[PerformanceLifetime] query failed:", error);
    return empty;
  }
}
