-- Operator week/month/day reports use the same timestamp windows as the admin dashboard:
--   day   = date_trunc('day', now())
--   week  = now() - 7 days
--   month = now() - 30 days
-- Source: commissions_log + tournament_commission_snapshots (created_at), not stat_date.

CREATE OR REPLACE FUNCTION public.fn_dashboard_operator_commission_can_read(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users viewer
    JOIN public.users subject ON subject.id = p_user_id
    WHERE viewer.id = auth.uid()
      AND (
        viewer.role = 'admin'::public.user_role
        OR viewer.id = subject.id
        OR (
          viewer.role = 'super'::public.user_role
          AND subject.parent_id = viewer.id
        )
        OR (
          viewer.role = 'agent'::public.user_role
          AND subject.parent_id = viewer.id
          AND subject.role = 'agent'::public.user_role
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.fn_dashboard_operator_commission_can_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_operator_commission_can_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_dashboard_operator_commission_summary(
  p_user_id uuid,
  p_role text
)
RETURNS TABLE(
  day_earned numeric,
  week_earned numeric,
  month_earned numeric,
  day_base numeric,
  week_base numeric,
  month_base numeric,
  day_tournament_earned numeric,
  week_tournament_earned numeric,
  month_tournament_earned numeric,
  day_tournament_base numeric,
  week_tournament_base numeric,
  month_tournament_base numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_subject_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_user_id IS NULL OR p_role IS NULL OR p_role NOT IN ('agent', 'super') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;

  SELECT u.role::text
    INTO v_subject_role
  FROM public.users u
  WHERE u.id = p_user_id;

  IF v_subject_role IS DISTINCT FROM p_role THEN
    RAISE EXCEPTION 'ROLE_MISMATCH';
  END IF;

  IF NOT public.fn_dashboard_operator_commission_can_read(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH b AS (
    SELECT now() AS n
  ),
  ticket AS (
    SELECT
      coalesce(sum(x.earned) FILTER (WHERE x.created_at >= date_trunc('day', b.n)), 0) AS day_earned,
      coalesce(sum(x.earned) FILTER (WHERE x.created_at >= (b.n - interval '7 days')), 0) AS week_earned,
      coalesce(sum(x.earned) FILTER (WHERE x.created_at >= (b.n - interval '30 days')), 0) AS month_earned,
      coalesce(sum(x.base) FILTER (WHERE x.created_at >= date_trunc('day', b.n)), 0) AS day_base,
      coalesce(sum(x.base) FILTER (WHERE x.created_at >= (b.n - interval '7 days')), 0) AS week_base,
      coalesce(sum(x.base) FILTER (WHERE x.created_at >= (b.n - interval '30 days')), 0) AS month_base
    FROM b
    LEFT JOIN LATERAL (
      SELECT
        CASE WHEN p_role = 'agent' THEN c.agent_amount ELSE c.super_amount END AS earned,
        c.commission_base AS base,
        c.created_at
      FROM public.commissions_log c
      WHERE c.status = 'settled'
        AND c.created_at >= (b.n - interval '30 days')
        AND (
          (p_role = 'agent' AND c.agent_id = p_user_id AND c.agent_amount > 0)
          OR (p_role = 'super' AND c.super_id = p_user_id AND c.super_amount > 0)
        )
    ) x ON true
    GROUP BY b.n
  ),
  tour AS (
    SELECT
      coalesce(sum(x.earned) FILTER (WHERE x.created_at >= date_trunc('day', b.n)), 0) AS day_earned,
      coalesce(sum(x.earned) FILTER (WHERE x.created_at >= (b.n - interval '7 days')), 0) AS week_earned,
      coalesce(sum(x.earned) FILTER (WHERE x.created_at >= (b.n - interval '30 days')), 0) AS month_earned,
      coalesce(sum(x.base) FILTER (WHERE x.created_at >= date_trunc('day', b.n)), 0) AS day_base,
      coalesce(sum(x.base) FILTER (WHERE x.created_at >= (b.n - interval '7 days')), 0) AS week_base,
      coalesce(sum(x.base) FILTER (WHERE x.created_at >= (b.n - interval '30 days')), 0) AS month_base
    FROM b
    LEFT JOIN LATERAL (
      SELECT
        CASE WHEN p_role = 'agent' THEN s.agent_amount ELSE s.super_amount END AS earned,
        s.commission_base AS base,
        s.created_at
      FROM public.tournament_commission_snapshots s
      WHERE s.created_at >= (b.n - interval '30 days')
        AND (
          (p_role = 'agent' AND s.agent_id = p_user_id AND s.agent_amount > 0)
          OR (p_role = 'super' AND s.super_id = p_user_id AND s.super_amount > 0)
        )
    ) x ON true
    GROUP BY b.n
  )
  SELECT
    ticket.day_earned + tour.day_earned,
    ticket.week_earned + tour.week_earned,
    ticket.month_earned + tour.month_earned,
    ticket.day_base + tour.day_base,
    ticket.week_base + tour.week_base,
    ticket.month_base + tour.month_base,
    tour.day_earned,
    tour.week_earned,
    tour.month_earned,
    tour.day_base,
    tour.week_base,
    tour.month_base
  FROM ticket, tour;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_dashboard_operator_commission_summary_range(
  p_user_id uuid,
  p_role text,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(
  earned numeric,
  base numeric,
  tournament_earned numeric,
  tournament_base numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_subject_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_user_id IS NULL OR p_role IS NULL OR p_role NOT IN ('agent', 'super') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;

  SELECT u.role::text
    INTO v_subject_role
  FROM public.users u
  WHERE u.id = p_user_id;

  IF v_subject_role IS DISTINCT FROM p_role THEN
    RAISE EXCEPTION 'ROLE_MISMATCH';
  END IF;

  IF NOT public.fn_dashboard_operator_commission_can_read(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH ticket AS (
    SELECT
      coalesce(sum(CASE WHEN p_role = 'agent' THEN c.agent_amount ELSE c.super_amount END), 0) AS earned,
      coalesce(sum(c.commission_base), 0) AS base
    FROM public.commissions_log c
    WHERE c.status = 'settled'
      AND c.created_at >= p_from
      AND c.created_at <= p_to
      AND (
        (p_role = 'agent' AND c.agent_id = p_user_id AND c.agent_amount > 0)
        OR (p_role = 'super' AND c.super_id = p_user_id AND c.super_amount > 0)
      )
  ),
  tour AS (
    SELECT
      coalesce(sum(CASE WHEN p_role = 'agent' THEN s.agent_amount ELSE s.super_amount END), 0) AS earned,
      coalesce(sum(s.commission_base), 0) AS base
    FROM public.tournament_commission_snapshots s
    WHERE s.created_at >= p_from
      AND s.created_at <= p_to
      AND (
        (p_role = 'agent' AND s.agent_id = p_user_id AND s.agent_amount > 0)
        OR (p_role = 'super' AND s.super_id = p_user_id AND s.super_amount > 0)
      )
  )
  SELECT
    ticket.earned + tour.earned,
    ticket.base + tour.base,
    tour.earned,
    tour.base
  FROM ticket, tour;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_dashboard_operator_commission_summary(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_operator_commission_summary(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_dashboard_operator_commission_summary_range(uuid, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_operator_commission_summary_range(uuid, text, timestamptz, timestamptz) TO authenticated;
