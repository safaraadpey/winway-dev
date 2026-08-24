-- Rolling period windows for admin dashboard summaries:
-- week  = last 7×24h from request time
-- month = last 30×24h from request time

CREATE OR REPLACE FUNCTION public.fn_dashboard_admin_commission_summary()
RETURNS TABLE(
  effective_user_id uuid,
  day_amount numeric,
  week_amount numeric,
  month_amount numeric,
  day_total numeric,
  week_total numeric,
  month_total numeric,
  day_tournament_total numeric,
  week_tournament_total numeric,
  month_tournament_total numeric,
  day_tournament_amount numeric,
  week_tournament_amount numeric,
  month_tournament_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_actor uuid;
  v_actor_role text;
  v_adminzero_id uuid;
  v_effective uuid;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT u.role::text
    INTO v_actor_role
  FROM public.users u
  WHERE u.id = v_actor;

  IF v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT u.id
    INTO v_adminzero_id
  FROM public.users u
  WHERE u.username = 'adminzero'
    AND u.role = 'admin'
  LIMIT 1;

  v_effective := coalesce(v_adminzero_id, v_actor);

  RETURN QUERY
  WITH b AS (
    SELECT now() AS n
  ),
  fee_ticket AS (
    SELECT
      coalesce(sum(t.amount) FILTER (WHERE t.created_at >= date_trunc('day', b.n)), 0) AS day_amount,
      coalesce(sum(t.amount) FILTER (WHERE t.created_at >= (b.n - interval '7 days')), 0) AS week_amount,
      coalesce(sum(t.amount) FILTER (WHERE t.created_at >= (b.n - interval '30 days')), 0) AS month_amount
    FROM public.transactions t
    CROSS JOIN b
    WHERE t.user_id = v_effective
      AND t.type = 'fee_admin'
      AND t.source_kind = 'ticket_commission'
  ),
  fee_tournament AS (
    SELECT
      coalesce(sum(s.admin_amount) FILTER (WHERE s.created_at >= date_trunc('day', b.n)), 0) AS day_amount,
      coalesce(sum(s.admin_amount) FILTER (WHERE s.created_at >= (b.n - interval '7 days')), 0) AS week_amount,
      coalesce(sum(s.admin_amount) FILTER (WHERE s.created_at >= (b.n - interval '30 days')), 0) AS month_amount
    FROM public.tournament_commission_snapshots s
    CROSS JOIN b
    WHERE s.admin_id = v_effective
       OR s.admin_id IS NULL
  ),
  base_ticket AS (
    SELECT
      coalesce(sum(c.commission_base) FILTER (WHERE c.created_at >= date_trunc('day', b.n)), 0) AS day_total,
      coalesce(sum(c.commission_base) FILTER (WHERE c.created_at >= (b.n - interval '7 days')), 0) AS week_total,
      coalesce(sum(c.commission_base) FILTER (WHERE c.created_at >= (b.n - interval '30 days')), 0) AS month_total
    FROM public.commissions_log c
    CROSS JOIN b
  ),
  base_tournament AS (
    SELECT
      coalesce(sum(s.commission_base) FILTER (WHERE s.created_at >= date_trunc('day', b.n)), 0) AS day_total,
      coalesce(sum(s.commission_base) FILTER (WHERE s.created_at >= (b.n - interval '7 days')), 0) AS week_total,
      coalesce(sum(s.commission_base) FILTER (WHERE s.created_at >= (b.n - interval '30 days')), 0) AS month_total
    FROM public.tournament_commission_snapshots s
    CROSS JOIN b
    WHERE s.admin_id = v_effective
       OR s.admin_id IS NULL
  )
  SELECT
    v_effective AS effective_user_id,
    fee_ticket.day_amount + fee_tournament.day_amount AS day_amount,
    fee_ticket.week_amount + fee_tournament.week_amount AS week_amount,
    fee_ticket.month_amount + fee_tournament.month_amount AS month_amount,
    base_ticket.day_total + base_tournament.day_total AS day_total,
    base_ticket.week_total + base_tournament.week_total AS week_total,
    base_ticket.month_total + base_tournament.month_total AS month_total,
    base_tournament.day_total AS day_tournament_total,
    base_tournament.week_total AS week_tournament_total,
    base_tournament.month_total AS month_tournament_total,
    fee_tournament.day_amount AS day_tournament_amount,
    fee_tournament.week_amount AS week_tournament_amount,
    fee_tournament.month_amount AS month_tournament_amount
  FROM fee_ticket, fee_tournament, base_ticket, base_tournament;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_dashboard_admin_tournament_guarantee_summary()
RETURNS TABLE(
  effective_user_id uuid,
  day_amount numeric,
  week_amount numeric,
  month_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_actor uuid;
  v_actor_role text;
  v_adminzero_id uuid;
  v_effective uuid;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT u.role::text
    INTO v_actor_role
  FROM public.users u
  WHERE u.id = v_actor;

  IF v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT u.id
    INTO v_adminzero_id
  FROM public.users u
  WHERE u.username = 'adminzero'
    AND u.role = 'admin'
  LIMIT 1;

  v_effective := coalesce(v_adminzero_id, v_actor);

  RETURN QUERY
  WITH b AS (
    SELECT now() AS n
  ),
  prizes_day AS (
    SELECT t.source_ref AS tournament_id, coalesce(sum(t.amount), 0) AS prize_amount
    FROM public.transactions t
    CROSS JOIN b
    WHERE t.source_kind = 'tournament_prize'
      AND t.type = 'win'
      AND t.created_at >= date_trunc('day', b.n)
    GROUP BY t.source_ref
  ),
  pools_day AS (
    SELECT s.tournament_id::text AS tournament_id, coalesce(sum(s.amount_to_pool), 0) AS pool_amount
    FROM public.tournament_commission_snapshots s
    JOIN prizes_day p ON p.tournament_id = s.tournament_id::text
    GROUP BY s.tournament_id::text
  ),
  agg_day AS (
    SELECT coalesce(sum(greatest(p.prize_amount - coalesce(pd.pool_amount, 0), 0)), 0) AS amount
    FROM prizes_day p
    LEFT JOIN pools_day pd ON pd.tournament_id = p.tournament_id
  ),
  prizes_week AS (
    SELECT t.source_ref AS tournament_id, coalesce(sum(t.amount), 0) AS prize_amount
    FROM public.transactions t
    CROSS JOIN b
    WHERE t.source_kind = 'tournament_prize'
      AND t.type = 'win'
      AND t.created_at >= (b.n - interval '7 days')
    GROUP BY t.source_ref
  ),
  pools_week AS (
    SELECT s.tournament_id::text AS tournament_id, coalesce(sum(s.amount_to_pool), 0) AS pool_amount
    FROM public.tournament_commission_snapshots s
    JOIN prizes_week p ON p.tournament_id = s.tournament_id::text
    GROUP BY s.tournament_id::text
  ),
  agg_week AS (
    SELECT coalesce(sum(greatest(p.prize_amount - coalesce(pw.pool_amount, 0), 0)), 0) AS amount
    FROM prizes_week p
    LEFT JOIN pools_week pw ON pw.tournament_id = p.tournament_id
  ),
  prizes_month AS (
    SELECT t.source_ref AS tournament_id, coalesce(sum(t.amount), 0) AS prize_amount
    FROM public.transactions t
    CROSS JOIN b
    WHERE t.source_kind = 'tournament_prize'
      AND t.type = 'win'
      AND t.created_at >= (b.n - interval '30 days')
    GROUP BY t.source_ref
  ),
  pools_month AS (
    SELECT s.tournament_id::text AS tournament_id, coalesce(sum(s.amount_to_pool), 0) AS pool_amount
    FROM public.tournament_commission_snapshots s
    JOIN prizes_month p ON p.tournament_id = s.tournament_id::text
    GROUP BY s.tournament_id::text
  ),
  agg_month AS (
    SELECT coalesce(sum(greatest(p.prize_amount - coalesce(pm.pool_amount, 0), 0)), 0) AS amount
    FROM prizes_month p
    LEFT JOIN pools_month pm ON pm.tournament_id = p.tournament_id
  )
  SELECT
    v_effective AS effective_user_id,
    agg_day.amount AS day_amount,
    agg_week.amount AS week_amount,
    agg_month.amount AS month_amount
  FROM agg_day, agg_week, agg_month;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_dashboard_admin_commission_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_admin_commission_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.fn_dashboard_admin_tournament_guarantee_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_admin_tournament_guarantee_summary() TO authenticated;
