BEGIN;

CREATE OR REPLACE FUNCTION public.fn_player_game_stats(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(
  total_cards_purchased bigint,
  total_purchase_amount numeric,
  line_wins_count bigint,
  full_wins_count bigint,
  win_rate numeric,
  average_cards_per_game numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_user uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'p_user_id required for service role';
    END IF;
    v_user := p_user_id;
  ELSE
    v_user := auth.uid();
    IF v_user IS NULL THEN
      RAISE EXCEPTION 'unauthenticated';
    END IF;
    IF p_user_id IS NOT NULL AND p_user_id <> v_user THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
  WITH normal_rooms AS (
    SELECT r.id
    FROM public.rooms r
    JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE rt.room_type = 'normal'
  ),
  tickets AS (
    SELECT t.room_id, t.price
    FROM public.tickets t
    WHERE t.player_user_id = v_user
      AND t.reservation_status IN ('confirmed', 'consumed')
      AND t.created_at >= p_from
      AND t.created_at <= p_to
      AND t.room_id IN (SELECT id FROM normal_rooms)
  ),
  ticket_stats AS (
    SELECT
      COUNT(*)::bigint AS total_cards,
      COALESCE(SUM(t.price), 0) AS total_price,
      COUNT(DISTINCT t.room_id)::bigint AS rooms_count
    FROM tickets t
  ),
  purchase_tx AS (
    SELECT
      COALESCE(SUM(tr.amount), 0) AS total_amount
    FROM public.transactions tr
    WHERE tr.user_id = v_user
      AND tr.type IN ('join', 'bet')
      AND tr.created_at >= p_from
      AND tr.created_at <= p_to
      AND tr.room_id IN (SELECT id FROM normal_rooms)
  ),
  results AS (
    SELECT
      COALESCE(SUM(CASE WHEN r.win_type = 'line' THEN 1 ELSE 0 END), 0)::bigint AS line_wins,
      COALESCE(SUM(CASE WHEN r.win_type = 'full' THEN 1 ELSE 0 END), 0)::bigint AS full_wins
    FROM public.results r
    WHERE r.user_id = v_user
      AND r.created_at >= p_from
      AND r.created_at <= p_to
      AND r.room_id IN (SELECT id FROM normal_rooms)
  )
  SELECT
    ts.total_cards AS total_cards_purchased,
    CASE
      WHEN ts.total_price > 0 THEN ts.total_price
      ELSE pt.total_amount
    END AS total_purchase_amount,
    rs.line_wins AS line_wins_count,
    rs.full_wins AS full_wins_count,
    CASE
      WHEN ts.total_cards > 0
        THEN ((rs.line_wins + rs.full_wins)::numeric / ts.total_cards) * 100
      ELSE 0
    END AS win_rate,
    CASE
      WHEN ts.rooms_count > 0
        THEN (ts.total_cards::numeric / ts.rooms_count)
      ELSE 0
    END AS average_cards_per_game
  FROM ticket_stats ts
  CROSS JOIN purchase_tx pt
  CROSS JOIN results rs;
END;
$function$;

COMMIT;

