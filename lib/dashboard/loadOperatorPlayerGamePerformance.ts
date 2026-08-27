import { pgPool } from "@/lib/pg";
import {
  getRollingMonthStart,
  getRollingWeekStart,
} from "@/lib/dashboard/loadCommissionDailyStats";
import {
  emptyOperatorPlayerGamePerformanceByPeriod,
  emptyPlayerGamePerformance,
  type OperatorPlayerGamePerformanceByPeriod,
  type OperatorPlayerGameRole,
  type PlayerGamePerformance,
} from "@/lib/dashboard/playerGamePerformance";

export type {
  OperatorPlayerGamePerformanceByPeriod,
  OperatorPlayerGameRole,
  PlayerGamePerformance,
} from "@/lib/dashboard/playerGamePerformance";
export {
  emptyOperatorPlayerGamePerformanceByPeriod,
  emptyPlayerGamePerformance,
} from "@/lib/dashboard/playerGamePerformance";

function toAmount(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function utcDayStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

type PeriodRow = {
  day_winnings: number | string;
  week_winnings: number | string;
  month_winnings: number | string;
  overall_winnings: number | string;
  day_purchases: number | string;
  week_purchases: number | string;
  month_purchases: number | string;
  overall_purchases: number | string;
  day_games?: number | string;
  week_games?: number | string;
  month_games?: number | string;
  overall_games?: number | string;
};

type RangeRow = {
  player_winnings: number | string;
  player_purchases: number | string;
  games_played?: number | string;
};

/**
 * Aggregated downline player win/purchase totals for an agent or super.
 *
 * Matches player leaderboard «سوابق» (`fn_player_stats`):
 * - winnings = paid reward_amount on normal rooms
 * - purchases/losses = card_price of confirmed/consumed tickets on normal rooms
 *
 * Source of truth: PostgreSQL.
 */
export async function loadOperatorPlayerGamePerformanceByPeriod(params: {
  operatorId: string;
  role: OperatorPlayerGameRole;
}): Promise<OperatorPlayerGamePerformanceByPeriod> {
  const empty = emptyOperatorPlayerGamePerformanceByPeriod();
  if (!pgPool) {
    console.error("[Dashboard] player game performance skipped: no PostgreSQL pool");
    return empty;
  }

  const now = new Date();
  const dayIso = utcDayStart(now).toISOString();
  const weekIso = getRollingWeekStart(now).toISOString();
  const monthIso = getRollingMonthStart(now).toISOString();

  try {
    const result = await pgPool.query<PeriodRow>(
      `
      WITH normal_rooms AS (
        SELECT r.id
        FROM public.rooms r
        JOIN public.room_templates rt ON rt.id = r.room_template_id
        WHERE rt.room_type = 'normal'
      ),
      downline AS (
        SELECT pa.user_id
        FROM public.player_affiliation pa
        WHERE ($1::text = 'agent' AND pa.agent_id = $2::uuid)
           OR ($1::text = 'super' AND pa.super_id = $2::uuid)
      ),
      wins AS (
        SELECT
          COALESCE(SUM(res.reward_amount) FILTER (WHERE res.created_at >= $3::timestamptz), 0) AS day_winnings,
          COALESCE(SUM(res.reward_amount) FILTER (WHERE res.created_at >= $4::timestamptz), 0) AS week_winnings,
          COALESCE(SUM(res.reward_amount) FILTER (WHERE res.created_at >= $5::timestamptz), 0) AS month_winnings,
          COALESCE(SUM(res.reward_amount), 0) AS overall_winnings
        FROM public.results res
        WHERE res.user_id IN (SELECT user_id FROM downline)
          AND res.paid_at IS NOT NULL
          AND res.room_id IN (SELECT id FROM normal_rooms)
      ),
      purchases AS (
        SELECT
          COALESCE(SUM(rm.card_price) FILTER (WHERE t.created_at >= $3::timestamptz), 0) AS day_purchases,
          COALESCE(SUM(rm.card_price) FILTER (WHERE t.created_at >= $4::timestamptz), 0) AS week_purchases,
          COALESCE(SUM(rm.card_price) FILTER (WHERE t.created_at >= $5::timestamptz), 0) AS month_purchases,
          COALESCE(SUM(rm.card_price), 0) AS overall_purchases
        FROM public.tickets t
        JOIN public.rooms rm ON rm.id = t.room_id
        WHERE t.player_user_id IN (SELECT user_id FROM downline)
          AND t.reservation_status IN ('confirmed', 'consumed')
          AND t.room_id IN (SELECT id FROM normal_rooms)
      )
      SELECT
        w.day_winnings,
        w.week_winnings,
        w.month_winnings,
        w.overall_winnings,
        p.day_purchases,
        p.week_purchases,
        p.month_purchases,
        p.overall_purchases
      FROM wins w
      CROSS JOIN purchases p
      `,
      [params.role, params.operatorId, dayIso, weekIso, monthIso]
    );

    const row = result.rows[0];
    if (!row) return empty;

    const data: OperatorPlayerGamePerformanceByPeriod = {
      day: {
        playerWinnings: toAmount(row.day_winnings),
        playerPurchases: toAmount(row.day_purchases),
        gamesPlayed: 0,
      },
      week: {
        playerWinnings: toAmount(row.week_winnings),
        playerPurchases: toAmount(row.week_purchases),
        gamesPlayed: 0,
      },
      month: {
        playerWinnings: toAmount(row.month_winnings),
        playerPurchases: toAmount(row.month_purchases),
        gamesPlayed: 0,
      },
      overall: {
        playerWinnings: toAmount(row.overall_winnings),
        playerPurchases: toAmount(row.overall_purchases),
        gamesPlayed: 0,
      },
    };

    console.log("[Dashboard] player game performance loaded", {
      operatorId: params.operatorId,
      role: params.role,
      source: "postgresql",
      dayWinnings: data.day.playerWinnings,
      dayPurchases: data.day.playerPurchases,
    });

    return data;
  } catch (error) {
    console.error("[Dashboard] player game performance query failed:", error);
    return empty;
  }
}

export async function loadOperatorPlayerGamePerformanceInRange(params: {
  operatorId: string;
  role: OperatorPlayerGameRole;
  fromIso: string;
  toIso: string;
}): Promise<PlayerGamePerformance> {
  const empty = emptyPlayerGamePerformance();
  if (!pgPool) {
    console.error("[Dashboard] player game performance range skipped: no PostgreSQL pool");
    return empty;
  }

  try {
    const result = await pgPool.query<RangeRow>(
      `
      WITH normal_rooms AS (
        SELECT r.id
        FROM public.rooms r
        JOIN public.room_templates rt ON rt.id = r.room_template_id
        WHERE rt.room_type = 'normal'
      ),
      downline AS (
        SELECT pa.user_id
        FROM public.player_affiliation pa
        WHERE ($1::text = 'agent' AND pa.agent_id = $2::uuid)
           OR ($1::text = 'super' AND pa.super_id = $2::uuid)
      ),
      wins AS (
        SELECT COALESCE(SUM(res.reward_amount), 0) AS player_winnings
        FROM public.results res
        WHERE res.user_id IN (SELECT user_id FROM downline)
          AND res.paid_at IS NOT NULL
          AND res.room_id IN (SELECT id FROM normal_rooms)
          AND res.created_at >= $3::timestamptz
          AND res.created_at <= $4::timestamptz
      ),
      purchases AS (
        SELECT COALESCE(SUM(rm.card_price), 0) AS player_purchases
        FROM public.tickets t
        JOIN public.rooms rm ON rm.id = t.room_id
        WHERE t.player_user_id IN (SELECT user_id FROM downline)
          AND t.reservation_status IN ('confirmed', 'consumed')
          AND t.room_id IN (SELECT id FROM normal_rooms)
          AND t.created_at >= $3::timestamptz
          AND t.created_at <= $4::timestamptz
      )
      SELECT w.player_winnings, p.player_purchases
      FROM wins w
      CROSS JOIN purchases p
      `,
      [params.role, params.operatorId, params.fromIso, params.toIso]
    );

    const row = result.rows[0];
    const data: PlayerGamePerformance = {
      playerWinnings: toAmount(row?.player_winnings),
      playerPurchases: toAmount(row?.player_purchases),
      gamesPlayed: 0,
    };

    console.log("[Dashboard] player game performance range loaded", {
      operatorId: params.operatorId,
      role: params.role,
      source: "postgresql",
      fromIso: params.fromIso,
      toIso: params.toIso,
      playerWinnings: data.playerWinnings,
      playerPurchases: data.playerPurchases,
    });

    return data;
  } catch (error) {
    console.error("[Dashboard] player game performance range query failed:", error);
    return empty;
  }
}

/**
 * Same formula as operator aggregation, scoped to one player.
 * Source of truth: PostgreSQL.
 */
export async function loadPlayerGamePerformanceByPeriod(params: {
  playerId: string;
}): Promise<OperatorPlayerGamePerformanceByPeriod> {
  const empty = emptyOperatorPlayerGamePerformanceByPeriod();
  if (!pgPool) {
    console.error("[UserAccount] player game performance skipped: no PostgreSQL pool");
    return empty;
  }

  const now = new Date();
  const dayIso = utcDayStart(now).toISOString();
  const weekIso = getRollingWeekStart(now).toISOString();
  const monthIso = getRollingMonthStart(now).toISOString();

  try {
    const result = await pgPool.query<PeriodRow>(
      `
      WITH normal_rooms AS (
        SELECT r.id
        FROM public.rooms r
        JOIN public.room_templates rt ON rt.id = r.room_template_id
        WHERE rt.room_type = 'normal'
      ),
      wins AS (
        SELECT
          COALESCE(SUM(res.reward_amount) FILTER (WHERE res.created_at >= $2::timestamptz), 0) AS day_winnings,
          COALESCE(SUM(res.reward_amount) FILTER (WHERE res.created_at >= $3::timestamptz), 0) AS week_winnings,
          COALESCE(SUM(res.reward_amount) FILTER (WHERE res.created_at >= $4::timestamptz), 0) AS month_winnings,
          COALESCE(SUM(res.reward_amount), 0) AS overall_winnings
        FROM public.results res
        WHERE res.user_id = $1::uuid
          AND res.paid_at IS NOT NULL
          AND res.room_id IN (SELECT id FROM normal_rooms)
      ),
      purchases AS (
        SELECT
          COALESCE(SUM(rm.card_price) FILTER (WHERE t.created_at >= $2::timestamptz), 0) AS day_purchases,
          COALESCE(SUM(rm.card_price) FILTER (WHERE t.created_at >= $3::timestamptz), 0) AS week_purchases,
          COALESCE(SUM(rm.card_price) FILTER (WHERE t.created_at >= $4::timestamptz), 0) AS month_purchases,
          COALESCE(SUM(rm.card_price), 0) AS overall_purchases
        FROM public.tickets t
        JOIN public.rooms rm ON rm.id = t.room_id
        WHERE t.player_user_id = $1::uuid
          AND t.reservation_status IN ('confirmed', 'consumed')
          AND t.room_id IN (SELECT id FROM normal_rooms)
      ),
      games AS (
        SELECT
          COUNT(DISTINCT t.room_id) FILTER (WHERE t.created_at >= $2::timestamptz)::bigint AS day_games,
          COUNT(DISTINCT t.room_id) FILTER (WHERE t.created_at >= $3::timestamptz)::bigint AS week_games,
          COUNT(DISTINCT t.room_id) FILTER (WHERE t.created_at >= $4::timestamptz)::bigint AS month_games,
          COUNT(DISTINCT t.room_id)::bigint AS overall_games
        FROM public.tickets t
        WHERE t.player_user_id = $1::uuid
          AND t.reservation_status IN ('confirmed', 'consumed')
          AND t.room_id IN (SELECT id FROM normal_rooms)
      )
      SELECT
        w.day_winnings,
        w.week_winnings,
        w.month_winnings,
        w.overall_winnings,
        p.day_purchases,
        p.week_purchases,
        p.month_purchases,
        p.overall_purchases,
        g.day_games,
        g.week_games,
        g.month_games,
        g.overall_games
      FROM wins w
      CROSS JOIN purchases p
      CROSS JOIN games g
      `,
      [params.playerId, dayIso, weekIso, monthIso]
    );

    const row = result.rows[0];
    if (!row) return empty;

    const data: OperatorPlayerGamePerformanceByPeriod = {
      day: {
        playerWinnings: toAmount(row.day_winnings),
        playerPurchases: toAmount(row.day_purchases),
        gamesPlayed: toAmount(row.day_games),
      },
      week: {
        playerWinnings: toAmount(row.week_winnings),
        playerPurchases: toAmount(row.week_purchases),
        gamesPlayed: toAmount(row.week_games),
      },
      month: {
        playerWinnings: toAmount(row.month_winnings),
        playerPurchases: toAmount(row.month_purchases),
        gamesPlayed: toAmount(row.month_games),
      },
      overall: {
        playerWinnings: toAmount(row.overall_winnings),
        playerPurchases: toAmount(row.overall_purchases),
        gamesPlayed: toAmount(row.overall_games),
      },
    };

    console.log("[UserAccount] player game performance loaded", {
      playerId: params.playerId,
      source: "postgresql",
      dayWinnings: data.day.playerWinnings,
      dayPurchases: data.day.playerPurchases,
      dayGames: data.day.gamesPlayed,
    });

    return data;
  } catch (error) {
    console.error("[UserAccount] player game performance query failed:", error);
    return empty;
  }
}

export async function loadPlayerGamePerformanceInRange(params: {
  playerId: string;
  fromIso: string;
  toIso: string;
}): Promise<PlayerGamePerformance> {
  const empty = emptyPlayerGamePerformance();
  if (!pgPool) {
    console.error("[UserAccount] player game performance range skipped: no PostgreSQL pool");
    return empty;
  }

  try {
    const result = await pgPool.query<RangeRow>(
      `
      WITH normal_rooms AS (
        SELECT r.id
        FROM public.rooms r
        JOIN public.room_templates rt ON rt.id = r.room_template_id
        WHERE rt.room_type = 'normal'
      ),
      wins AS (
        SELECT COALESCE(SUM(res.reward_amount), 0) AS player_winnings
        FROM public.results res
        WHERE res.user_id = $1::uuid
          AND res.paid_at IS NOT NULL
          AND res.room_id IN (SELECT id FROM normal_rooms)
          AND res.created_at >= $2::timestamptz
          AND res.created_at <= $3::timestamptz
      ),
      purchases AS (
        SELECT COALESCE(SUM(rm.card_price), 0) AS player_purchases
        FROM public.tickets t
        JOIN public.rooms rm ON rm.id = t.room_id
        WHERE t.player_user_id = $1::uuid
          AND t.reservation_status IN ('confirmed', 'consumed')
          AND t.room_id IN (SELECT id FROM normal_rooms)
          AND t.created_at >= $2::timestamptz
          AND t.created_at <= $3::timestamptz
      ),
      games AS (
        SELECT COUNT(DISTINCT t.room_id)::bigint AS games_played
        FROM public.tickets t
        WHERE t.player_user_id = $1::uuid
          AND t.reservation_status IN ('confirmed', 'consumed')
          AND t.room_id IN (SELECT id FROM normal_rooms)
          AND t.created_at >= $2::timestamptz
          AND t.created_at <= $3::timestamptz
      )
      SELECT w.player_winnings, p.player_purchases, g.games_played
      FROM wins w
      CROSS JOIN purchases p
      CROSS JOIN games g
      `,
      [params.playerId, params.fromIso, params.toIso]
    );

    const row = result.rows[0];
    const data: PlayerGamePerformance = {
      playerWinnings: toAmount(row?.player_winnings),
      playerPurchases: toAmount(row?.player_purchases),
      gamesPlayed: toAmount(row?.games_played),
    };

    console.log("[UserAccount] player game performance range loaded", {
      playerId: params.playerId,
      source: "postgresql",
      fromIso: params.fromIso,
      toIso: params.toIso,
      playerWinnings: data.playerWinnings,
      playerPurchases: data.playerPurchases,
    });

    return data;
  } catch (error) {
    console.error("[UserAccount] player game performance range query failed:", error);
    return empty;
  }
}
