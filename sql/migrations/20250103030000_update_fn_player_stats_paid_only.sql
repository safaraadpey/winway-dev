BEGIN;

DROP FUNCTION IF EXISTS public.fn_player_stats(uuid, timestamptz);

CREATE FUNCTION public.fn_player_stats(
  p_user_id uuid,
  p_date timestamptz DEFAULT NOW()
)
RETURNS TABLE(
  period_type text,
  total_winnings numeric,
  total_purchases numeric,
  card_count bigint,
  win_count bigint,
  purchase_count bigint,
  tournament_winnings numeric,
  line_wins_count bigint,
  full_wins_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public
STABLE
AS $function$
  WITH normal_rooms AS (
    SELECT r.id
    FROM public.rooms r
    JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE rt.room_type = 'normal'
  ),
  tournament_rooms AS (
    SELECT r.id
    FROM public.rooms r
    JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE rt.room_type = 'tournament'
  ),
  daily_wins AS (
    SELECT 
      COALESCE(SUM(r.reward_amount), 0) AS total_winnings,
      COUNT(*)::bigint AS win_count,
      COALESCE(SUM(CASE WHEN r.win_type = 'line' THEN 1 ELSE 0 END), 0)::bigint AS line_wins_count,
      COALESCE(SUM(CASE WHEN r.win_type = 'full' THEN 1 ELSE 0 END), 0)::bigint AS full_wins_count
    FROM public.results r
    WHERE r.user_id = p_user_id
      AND r.paid_at IS NOT NULL
      AND r.created_at >= DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND r.created_at < (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC'
      AND r.room_id IN (SELECT id FROM normal_rooms)
  ),
  daily_tournament_wins AS (
    SELECT COALESCE(SUM(r.reward_amount), 0) AS tournament_winnings
    FROM public.results r
    WHERE r.user_id = p_user_id
      AND r.paid_at IS NOT NULL
      AND r.created_at >= DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND r.created_at < (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC'
      AND r.room_id IN (SELECT id FROM tournament_rooms)
  ),
  daily_purchases AS (
    SELECT 
      COALESCE(SUM(r.card_price), 0) AS total_purchases,
      COUNT(DISTINCT t.transaction_id)::bigint AS purchase_count,
      COUNT(*)::bigint AS card_count
    FROM public.tickets t
    JOIN public.rooms r ON r.id = t.room_id
    WHERE t.player_user_id = p_user_id
      AND t.created_at >= DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND t.created_at < (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC'
      AND t.reservation_status IN ('confirmed', 'consumed')
      AND t.room_id IN (SELECT id FROM normal_rooms)
  ),
  weekly_wins AS (
    SELECT 
      COALESCE(SUM(r.reward_amount), 0) AS total_winnings,
      COUNT(*)::bigint AS win_count,
      COALESCE(SUM(CASE WHEN r.win_type = 'line' THEN 1 ELSE 0 END), 0)::bigint AS line_wins_count,
      COALESCE(SUM(CASE WHEN r.win_type = 'full' THEN 1 ELSE 0 END), 0)::bigint AS full_wins_count
    FROM public.results r
    WHERE r.user_id = p_user_id
      AND r.paid_at IS NOT NULL
      AND r.created_at >= (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') - INTERVAL '6 days') AT TIME ZONE 'UTC'
      AND r.created_at < (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC'
      AND r.room_id IN (SELECT id FROM normal_rooms)
  ),
  weekly_tournament_wins AS (
    SELECT COALESCE(SUM(r.reward_amount), 0) AS tournament_winnings
    FROM public.results r
    WHERE r.user_id = p_user_id
      AND r.paid_at IS NOT NULL
      AND r.created_at >= (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') - INTERVAL '6 days') AT TIME ZONE 'UTC'
      AND r.created_at < (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC'
      AND r.room_id IN (SELECT id FROM tournament_rooms)
  ),
  weekly_purchases AS (
    SELECT 
      COALESCE(SUM(r.card_price), 0) AS total_purchases,
      COUNT(DISTINCT t.transaction_id)::bigint AS purchase_count,
      COUNT(*)::bigint AS card_count
    FROM public.tickets t
    JOIN public.rooms r ON r.id = t.room_id
    WHERE t.player_user_id = p_user_id
      AND t.created_at >= (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') - INTERVAL '6 days') AT TIME ZONE 'UTC'
      AND t.created_at < (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC'
      AND t.reservation_status IN ('confirmed', 'consumed')
      AND t.room_id IN (SELECT id FROM normal_rooms)
  ),
  monthly_wins AS (
    SELECT 
      COALESCE(SUM(r.reward_amount), 0) AS total_winnings,
      COUNT(*)::bigint AS win_count,
      COALESCE(SUM(CASE WHEN r.win_type = 'line' THEN 1 ELSE 0 END), 0)::bigint AS line_wins_count,
      COALESCE(SUM(CASE WHEN r.win_type = 'full' THEN 1 ELSE 0 END), 0)::bigint AS full_wins_count
    FROM public.results r
    WHERE r.user_id = p_user_id
      AND r.paid_at IS NOT NULL
      AND r.created_at >= DATE_TRUNC('month', p_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND r.created_at < (DATE_TRUNC('month', p_date AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC'
      AND r.room_id IN (SELECT id FROM normal_rooms)
  ),
  monthly_tournament_wins AS (
    SELECT COALESCE(SUM(r.reward_amount), 0) AS tournament_winnings
    FROM public.results r
    WHERE r.user_id = p_user_id
      AND r.paid_at IS NOT NULL
      AND r.created_at >= DATE_TRUNC('month', p_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND r.created_at < (DATE_TRUNC('month', p_date AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC'
      AND r.room_id IN (SELECT id FROM tournament_rooms)
  ),
  monthly_purchases AS (
    SELECT 
      COALESCE(SUM(r.card_price), 0) AS total_purchases,
      COUNT(DISTINCT t.transaction_id)::bigint AS purchase_count,
      COUNT(*)::bigint AS card_count
    FROM public.tickets t
    JOIN public.rooms r ON r.id = t.room_id
    WHERE t.player_user_id = p_user_id
      AND t.created_at >= DATE_TRUNC('month', p_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND t.created_at < (DATE_TRUNC('month', p_date AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC'
      AND t.reservation_status IN ('confirmed', 'consumed')
      AND t.room_id IN (SELECT id FROM normal_rooms)
  )
  SELECT 
    'daily'::text AS period_type,
    dw.total_winnings,
    dp.total_purchases,
    dp.card_count,
    dw.win_count,
    dp.purchase_count,
    dwt.tournament_winnings,
    dw.line_wins_count,
    dw.full_wins_count
  FROM daily_wins dw
  CROSS JOIN daily_purchases dp
  CROSS JOIN daily_tournament_wins dwt
  UNION ALL
  SELECT 
    'weekly'::text AS period_type,
    ww.total_winnings,
    wp.total_purchases,
    wp.card_count,
    ww.win_count,
    wp.purchase_count,
    wwt.tournament_winnings,
    ww.line_wins_count,
    ww.full_wins_count
  FROM weekly_wins ww
  CROSS JOIN weekly_purchases wp
  CROSS JOIN weekly_tournament_wins wwt
  UNION ALL
  SELECT 
    'monthly'::text AS period_type,
    mw.total_winnings,
    mp.total_purchases,
    mp.card_count,
    mw.win_count,
    mp.purchase_count,
    mwt.tournament_winnings,
    mw.line_wins_count,
    mw.full_wins_count
  FROM monthly_wins mw
  CROSS JOIN monthly_purchases mp
  CROSS JOIN monthly_tournament_wins mwt;
$function$;

COMMIT;

