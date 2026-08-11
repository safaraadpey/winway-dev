BEGIN;

CREATE OR REPLACE FUNCTION public.fn_leaderboard_weekly(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(
  player_id uuid,
  player_name text,
  display_name text,
  avatar_url text,
  total_wins numeric,
  card_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public
AS $function$
  WITH normal_rooms AS (
    SELECT r.id
    FROM public.rooms r
    JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE rt.room_type = 'normal'
  ),
  wins AS (
    SELECT r.user_id, SUM(COALESCE(r.reward_amount, 0)) AS total_wins
    FROM public.results r
    WHERE r.created_at >= p_from
      AND r.created_at <= p_to
      AND r.room_id IN (SELECT id FROM normal_rooms)
    GROUP BY r.user_id
  ),
  cards AS (
    SELECT t.player_user_id AS user_id, COUNT(*)::bigint AS card_count
    FROM public.tickets t
    WHERE t.created_at >= p_from
      AND t.created_at <= p_to
      AND t.reservation_status IN ('confirmed','consumed')
      AND t.room_id IN (SELECT id FROM normal_rooms)
    GROUP BY t.player_user_id
  ),
  ids AS (
    SELECT user_id FROM wins
    UNION
    SELECT user_id FROM cards
  )
  SELECT
    u.id AS player_id,
    u.username AS player_name,
    up.nickname AS display_name,
    up.avatar_url AS avatar_url,
    COALESCE(w.total_wins, 0) AS total_wins,
    COALESCE(c.card_count, 0) AS card_count
  FROM ids
  JOIN public.users u ON u.id = ids.user_id
  LEFT JOIN public.user_profiles up ON up.user_id = u.id
  LEFT JOIN wins w ON w.user_id = ids.user_id
  LEFT JOIN cards c ON c.user_id = ids.user_id
  WHERE u.role = 'player';
$function$;

COMMIT;

