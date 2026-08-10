import type { Pool } from "pg";

export type PlayerWeeklyPerformance = {
  gamesPlayed: number;
  totalWinnings: number;
};

/**
 * Rolling 7-day player performance (matches fn_player_stats weekly window).
 * Games = distinct normal rooms with confirmed/consumed tickets.
 * Winnings = sum of paid reward_amount on normal room results.
 */
export async function getPlayersWeeklyPerformance(
  pool: Pool,
  playerIds: string[]
): Promise<Map<string, PlayerWeeklyPerformance>> {
  const uniqueIds = [...new Set(playerIds.filter(Boolean))];
  const map = new Map<string, PlayerWeeklyPerformance>();
  if (uniqueIds.length === 0) return map;

  const result = await pool.query<{
    player_id: string;
    games_played: string | number;
    total_winnings: string | number;
  }>(
    `
    WITH normal_rooms AS (
      SELECT r.id
      FROM public.rooms r
      JOIN public.room_templates rt ON rt.id = r.room_template_id
      WHERE rt.room_type = 'normal'
    ),
    week_bounds AS (
      SELECT
        (DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') - INTERVAL '6 days') AT TIME ZONE 'UTC' AS week_from,
        (DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC' AS week_to
    ),
    players AS (
      SELECT unnest($1::uuid[]) AS player_id
    ),
    games AS (
      SELECT t.player_user_id AS player_id, COUNT(DISTINCT t.room_id)::bigint AS games_played
      FROM public.tickets t
      CROSS JOIN week_bounds wb
      WHERE t.player_user_id = ANY($1::uuid[])
        AND t.reservation_status IN ('confirmed', 'consumed')
        AND t.created_at >= wb.week_from
        AND t.created_at < wb.week_to
        AND t.room_id IN (SELECT id FROM normal_rooms)
      GROUP BY t.player_user_id
    ),
    wins AS (
      SELECT r.user_id AS player_id, COALESCE(SUM(r.reward_amount), 0) AS total_winnings
      FROM public.results r
      CROSS JOIN week_bounds wb
      WHERE r.user_id = ANY($1::uuid[])
        AND r.paid_at IS NOT NULL
        AND r.created_at >= wb.week_from
        AND r.created_at < wb.week_to
        AND r.room_id IN (SELECT id FROM normal_rooms)
      GROUP BY r.user_id
    )
    SELECT
      p.player_id,
      COALESCE(g.games_played, 0) AS games_played,
      COALESCE(w.total_winnings, 0) AS total_winnings
    FROM players p
    LEFT JOIN games g ON g.player_id = p.player_id
    LEFT JOIN wins w ON w.player_id = p.player_id
    `,
    [uniqueIds]
  );

  for (const row of result.rows) {
    map.set(row.player_id, {
      gamesPlayed: Number(row.games_played) || 0,
      totalWinnings: Number(row.total_winnings) || 0,
    });
  }

  console.log("[Withdrawal] player weekly performance loaded", {
    playerCount: uniqueIds.length,
    withData: map.size,
  });

  return map;
}
