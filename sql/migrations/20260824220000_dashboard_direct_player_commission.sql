-- Admin dashboard: commission earned from players with no agent/super affiliation.

DROP FUNCTION IF EXISTS public.fn_dashboard_admin_commission_summary();

CREATE FUNCTION public.fn_dashboard_admin_commission_summary()
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
  month_tournament_amount numeric,
  day_direct_amount numeric,
  week_direct_amount numeric,
  month_direct_amount numeric
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
    WHERE c.status = 'settled'
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
  ),
  direct_ticket AS (
    SELECT
      coalesce(sum(c.admin_amount) FILTER (WHERE c.created_at >= date_trunc('day', b.n)), 0) AS day_amount,
      coalesce(sum(c.admin_amount) FILTER (WHERE c.created_at >= (b.n - interval '7 days')), 0) AS week_amount,
      coalesce(sum(c.admin_amount) FILTER (WHERE c.created_at >= (b.n - interval '30 days')), 0) AS month_amount
    FROM public.commissions_log c
    CROSS JOIN b
    WHERE c.status = 'settled'
      AND c.agent_id IS NULL
      AND c.super_id IS NULL
  ),
  direct_tournament AS (
    SELECT
      coalesce(sum(s.admin_amount) FILTER (WHERE s.created_at >= date_trunc('day', b.n)), 0) AS day_amount,
      coalesce(sum(s.admin_amount) FILTER (WHERE s.created_at >= (b.n - interval '7 days')), 0) AS week_amount,
      coalesce(sum(s.admin_amount) FILTER (WHERE s.created_at >= (b.n - interval '30 days')), 0) AS month_amount
    FROM public.tournament_commission_snapshots s
    CROSS JOIN b
    WHERE (s.admin_id = v_effective OR s.admin_id IS NULL)
      AND s.agent_id IS NULL
      AND s.super_id IS NULL
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
    fee_tournament.month_amount AS month_tournament_amount,
    direct_ticket.day_amount + direct_tournament.day_amount AS day_direct_amount,
    direct_ticket.week_amount + direct_tournament.week_amount AS week_direct_amount,
    direct_ticket.month_amount + direct_tournament.month_amount AS month_direct_amount
  FROM fee_ticket, fee_tournament, base_ticket, base_tournament, direct_ticket, direct_tournament;
END;
$$;

DROP FUNCTION IF EXISTS public.fn_dashboard_admin_commission_summary_range(timestamptz, timestamptz);

CREATE FUNCTION public.fn_dashboard_admin_commission_summary_range(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(
  effective_user_id uuid,
  amount numeric,
  total numeric,
  tournament_amount numeric,
  tournament_total numeric,
  direct_amount numeric
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

  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'INVALID_RANGE';
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
  WITH fee_ticket AS (
    SELECT coalesce(sum(t.amount), 0) AS amount
    FROM public.transactions t
    WHERE t.user_id = v_effective
      AND t.type = 'fee_admin'
      AND t.source_kind = 'ticket_commission'
      AND t.created_at >= p_from
      AND t.created_at <= p_to
  ),
  fee_tournament AS (
    SELECT coalesce(sum(s.admin_amount), 0) AS amount
    FROM public.tournament_commission_snapshots s
    WHERE (s.admin_id = v_effective OR s.admin_id IS NULL)
      AND s.created_at >= p_from
      AND s.created_at <= p_to
  ),
  base_ticket AS (
    SELECT coalesce(sum(c.commission_base), 0) AS total
    FROM public.commissions_log c
    WHERE c.created_at >= p_from
      AND c.created_at <= p_to
      AND c.status = 'settled'
  ),
  base_tournament AS (
    SELECT coalesce(sum(s.commission_base), 0) AS total
    FROM public.tournament_commission_snapshots s
    WHERE (s.admin_id = v_effective OR s.admin_id IS NULL)
      AND s.created_at >= p_from
      AND s.created_at <= p_to
  ),
  direct_ticket AS (
    SELECT coalesce(sum(c.admin_amount), 0) AS amount
    FROM public.commissions_log c
    WHERE c.created_at >= p_from
      AND c.created_at <= p_to
      AND c.status = 'settled'
      AND c.agent_id IS NULL
      AND c.super_id IS NULL
  ),
  direct_tournament AS (
    SELECT coalesce(sum(s.admin_amount), 0) AS amount
    FROM public.tournament_commission_snapshots s
    WHERE (s.admin_id = v_effective OR s.admin_id IS NULL)
      AND s.created_at >= p_from
      AND s.created_at <= p_to
      AND s.agent_id IS NULL
      AND s.super_id IS NULL
  )
  SELECT
    v_effective AS effective_user_id,
    fee_ticket.amount + fee_tournament.amount AS amount,
    base_ticket.total + base_tournament.total AS total,
    fee_tournament.amount AS tournament_amount,
    base_tournament.total AS tournament_total,
    direct_ticket.amount + direct_tournament.amount AS direct_amount
  FROM fee_ticket, fee_tournament, base_ticket, base_tournament, direct_ticket, direct_tournament;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_dashboard_admin_commission_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_admin_commission_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.fn_dashboard_admin_commission_summary_range(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_admin_commission_summary_range(timestamptz, timestamptz) TO authenticated;
