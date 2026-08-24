-- Lifetime commission performance rollup for agent/super (day grain).
-- Populated idempotently at ticket/tournament commission settle time.

BEGIN;

CREATE TABLE IF NOT EXISTS public.commission_stat_events (
  source_kind text NOT NULL
    CHECK (source_kind IN ('ticket', 'tournament_entry')),
  source_id uuid NOT NULL,
  settled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_kind, source_id)
);

COMMENT ON TABLE public.commission_stat_events IS
  'Idempotency guard: one rollup application per ticket or tournament entry.';

CREATE TABLE IF NOT EXISTS public.commission_daily_stats (
  user_id uuid NOT NULL REFERENCES public.users(id),
  role text NOT NULL CHECK (role IN ('agent', 'super')),
  stat_date date NOT NULL,
  currency text NOT NULL DEFAULT 'IRR',
  source_kind text NOT NULL CHECK (source_kind IN ('ticket', 'tournament')),
  events_count integer NOT NULL DEFAULT 0 CHECK (events_count >= 0),
  earned_amount numeric NOT NULL DEFAULT 0 CHECK (earned_amount >= 0),
  commission_base numeric NOT NULL DEFAULT 0 CHECK (commission_base >= 0),
  gross_amount numeric NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role, stat_date, currency, source_kind)
);

COMMENT ON TABLE public.commission_daily_stats IS
  'Daily commission performance rollup for agent/super dashboards (lifetime-safe).';

CREATE INDEX IF NOT EXISTS idx_commission_daily_stats_user_role_date
  ON public.commission_daily_stats (user_id, role, stat_date DESC);

CREATE INDEX IF NOT EXISTS idx_commission_daily_stats_stat_date
  ON public.commission_daily_stats (stat_date DESC);

CREATE OR REPLACE FUNCTION game_finance.fn_apply_commission_daily_stats(
  p_event_source_kind text,
  p_event_source_id uuid,
  p_settled_at timestamptz,
  p_daily_source_kind text,
  p_currency text,
  p_gross_amount numeric,
  p_commission_base numeric,
  p_agent_id uuid,
  p_super_id uuid,
  p_agent_amount numeric,
  p_super_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'game_finance', 'public', 'pg_temp'
AS $$
DECLARE
  v_row_count integer := 0;
  v_stat_date date;
  v_currency text;
  v_gross numeric;
  v_base numeric;
BEGIN
  IF p_event_source_kind NOT IN ('ticket', 'tournament_entry') THEN
    RAISE EXCEPTION '[Commission] invalid event source_kind: %', p_event_source_kind;
  END IF;

  IF p_daily_source_kind NOT IN ('ticket', 'tournament') THEN
    RAISE EXCEPTION '[Commission] invalid daily source_kind: %', p_daily_source_kind;
  END IF;

  IF p_event_source_id IS NULL OR p_settled_at IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.commission_stat_events (source_kind, source_id, settled_at)
  VALUES (p_event_source_kind, p_event_source_id, p_settled_at)
  ON CONFLICT (source_kind, source_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count = 0 THEN
    RETURN;
  END IF;

  v_stat_date := (p_settled_at AT TIME ZONE 'UTC')::date;
  v_currency := COALESCE(NULLIF(btrim(p_currency), ''), 'IRR');
  v_gross := GREATEST(COALESCE(p_gross_amount, 0), 0);
  v_base := GREATEST(COALESCE(p_commission_base, 0), 0);

  IF p_agent_id IS NOT NULL AND COALESCE(p_agent_amount, 0) > 0 THEN
    INSERT INTO public.commission_daily_stats (
      user_id, role, stat_date, currency, source_kind,
      events_count, earned_amount, commission_base, gross_amount, updated_at
    ) VALUES (
      p_agent_id, 'agent', v_stat_date, v_currency, p_daily_source_kind,
      1, COALESCE(p_agent_amount, 0), v_base, v_gross, now()
    )
    ON CONFLICT (user_id, role, stat_date, currency, source_kind) DO UPDATE
      SET events_count = public.commission_daily_stats.events_count + 1,
          earned_amount = public.commission_daily_stats.earned_amount + EXCLUDED.earned_amount,
          commission_base = public.commission_daily_stats.commission_base + EXCLUDED.commission_base,
          gross_amount = public.commission_daily_stats.gross_amount + EXCLUDED.gross_amount,
          updated_at = now();
  END IF;

  IF p_super_id IS NOT NULL AND COALESCE(p_super_amount, 0) > 0 THEN
    INSERT INTO public.commission_daily_stats (
      user_id, role, stat_date, currency, source_kind,
      events_count, earned_amount, commission_base, gross_amount, updated_at
    ) VALUES (
      p_super_id, 'super', v_stat_date, v_currency, p_daily_source_kind,
      1, COALESCE(p_super_amount, 0), v_base, v_gross, now()
    )
    ON CONFLICT (user_id, role, stat_date, currency, source_kind) DO UPDATE
      SET events_count = public.commission_daily_stats.events_count + 1,
          earned_amount = public.commission_daily_stats.earned_amount + EXCLUDED.earned_amount,
          commission_base = public.commission_daily_stats.commission_base + EXCLUDED.commission_base,
          gross_amount = public.commission_daily_stats.gross_amount + EXCLUDED.gross_amount,
          updated_at = now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION game_finance.fn_apply_commission_daily_stats_from_ticket(
  p_ticket uuid,
  p_settled_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'game_finance', 'public', 'pg_temp'
AS $$
DECLARE
  c record;
  v_settled_at timestamptz;
BEGIN
  SELECT *
    INTO c
  FROM public.commissions_log
  WHERE ticket_id = p_ticket
    AND status = 'settled';

  IF NOT FOUND THEN
    RAISE LOG '[Commission] skip daily stats: settled commission log missing for ticket %', p_ticket;
    RETURN;
  END IF;

  v_settled_at := COALESCE(p_settled_at, c.distributed_at, c.created_at, now());

  PERFORM game_finance.fn_apply_commission_daily_stats(
    p_event_source_kind := 'ticket',
    p_event_source_id := c.ticket_id,
    p_settled_at := v_settled_at,
    p_daily_source_kind := 'ticket',
    p_currency := c.currency,
    p_gross_amount := c.gross_amount,
    p_commission_base := c.commission_base,
    p_agent_id := c.agent_id,
    p_super_id := c.super_id,
    p_agent_amount := c.agent_amount,
    p_super_amount := c.super_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION game_finance.fn_apply_commission_daily_stats_from_tournament_entry(
  p_entry_id uuid,
  p_settled_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'game_finance', 'public', 'pg_temp'
AS $$
DECLARE
  s record;
  v_settled_at timestamptz;
BEGIN
  SELECT *
    INTO s
  FROM public.tournament_commission_snapshots
  WHERE entry_id = p_entry_id;

  IF NOT FOUND THEN
    RAISE LOG '[Commission] skip daily stats: tournament snapshot missing for entry %', p_entry_id;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tournament_commission_payouts p
    WHERE p.entry_id = p_entry_id
      AND p.status = 'paid'
      AND p.role IN ('agent', 'super')
  ) THEN
    RETURN;
  END IF;

  SELECT max(p.paid_at)
    INTO v_settled_at
  FROM public.tournament_commission_payouts p
  WHERE p.entry_id = p_entry_id
    AND p.status = 'paid';

  v_settled_at := COALESCE(p_settled_at, v_settled_at, s.created_at, now());

  PERFORM game_finance.fn_apply_commission_daily_stats(
    p_event_source_kind := 'tournament_entry',
    p_event_source_id := s.entry_id,
    p_settled_at := v_settled_at,
    p_daily_source_kind := 'tournament',
    p_currency := s.currency,
    p_gross_amount := s.gross_amount,
    p_commission_base := s.commission_base,
    p_agent_id := s.agent_id,
    p_super_id := s.super_id,
    p_agent_amount := s.agent_amount,
    p_super_amount := s.super_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION game_finance.fn_distribute_ticket_commission(
  p_ticket uuid,
  p_admin_user uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  c record;
  v_currency text;
  v_admin_user uuid;
  v_rollup_amount numeric := 0;
  v_settled_at timestamptz := now();
BEGIN
  SELECT *
    INTO c
  FROM public.commissions_log
  WHERE ticket_id = p_ticket
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM game_finance.fn_record_ticket_commission(p_ticket);
    SELECT * INTO c
    FROM public.commissions_log
    WHERE ticket_id = p_ticket
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'commission log not found for ticket %', p_ticket;
    END IF;
  END IF;

  IF c.status IS DISTINCT FROM 'pending' THEN
    RETURN 0;
  END IF;

  SELECT currency INTO v_currency
  FROM public.rooms
  WHERE id = c.room_id;

  IF p_admin_user IS NOT NULL THEN
    SELECT u.id
      INTO v_admin_user
    FROM public.users u
    WHERE u.id = p_admin_user
      AND u.role = 'admin'
      AND (u.status IS NULL OR u.status = 'active'::public.user_status)
    LIMIT 1;
  END IF;

  IF v_admin_user IS NULL THEN
    SELECT u.id
      INTO v_admin_user
    FROM public.users u
    WHERE u.role = 'admin'
      AND u.admin_sub_role IS NULL
      AND (u.status IS NULL OR u.status = 'active'::public.user_status)
    ORDER BY u.created_at
    LIMIT 1;
  END IF;

  IF v_admin_user IS NULL THEN
    SELECT u.id
      INTO v_admin_user
    FROM public.users u
    WHERE u.role = 'admin'
      AND (u.status IS NULL OR u.status = 'active'::public.user_status)
    ORDER BY u.created_at
    LIMIT 1;
  END IF;

  IF v_admin_user IS NULL THEN
    RAISE EXCEPTION 'no admin user available for commission payout';
  END IF;

  IF c.agent_id IS NOT NULL AND c.agent_amount > 0 THEN
    BEGIN
      PERFORM game_finance.fn_wallet_apply_delta(
        p_user_id := c.agent_id,
        p_currency := v_currency,
        p_amount_delta := c.agent_amount,
        p_transaction_type := 'fee_agent',
        p_source_kind := 'ticket_commission',
        p_source_ref := c.ticket_id::text,
        p_description := 'ticket commission (agent)',
        p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
        p_allow_negative := false
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_rollup_amount := v_rollup_amount + c.agent_amount;
    END;
  END IF;

  IF c.super_id IS NOT NULL AND c.super_amount > 0 THEN
    BEGIN
      PERFORM game_finance.fn_wallet_apply_delta(
        p_user_id := c.super_id,
        p_currency := v_currency,
        p_amount_delta := c.super_amount,
        p_transaction_type := 'fee_super',
        p_source_kind := 'ticket_commission',
        p_source_ref := c.ticket_id::text,
        p_description := 'ticket commission (super)',
        p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
        p_allow_negative := false
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_rollup_amount := v_rollup_amount + c.super_amount;
    END;
  END IF;

  IF (c.admin_amount + v_rollup_amount) > 0 THEN
    PERFORM game_finance.fn_wallet_apply_delta(
      p_user_id := v_admin_user,
      p_currency := v_currency,
      p_amount_delta := c.admin_amount + v_rollup_amount,
      p_transaction_type := 'fee_admin',
      p_source_kind := 'ticket_commission',
      p_source_ref := c.ticket_id::text,
      p_description := 'ticket commission (admin remainder)',
      p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
      p_allow_negative := false
    );
  END IF;

  UPDATE public.commissions_log
     SET distributed_at = v_settled_at,
         admin_amount   = c.admin_amount + v_rollup_amount,
         status         = 'settled'
   WHERE id = c.id;

  PERFORM game_finance.fn_apply_commission_daily_stats_from_ticket(p_ticket, v_settled_at);

  RETURN GREATEST(COALESCE(c.amount_to_pool, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION tournament.fn_settle_commission_payouts(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $$
DECLARE
  r_pay record;
  v_now timestamptz := now();
  v_entry_ids uuid[] := '{}';
BEGIN
  FOR r_pay IN
    SELECT id, entry_id, beneficiary_user_id, amount, currency, role
    FROM public.tournament_commission_payouts
    WHERE tournament_id = p_tournament_id
      AND status = 'pending'
      AND amount > 0
      AND role IN ('admin', 'agent', 'super')
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM game_finance.fn_wallet_apply_delta(
      p_user_id := r_pay.beneficiary_user_id,
      p_currency := r_pay.currency,
      p_amount_delta := r_pay.amount,
      p_transaction_type := 'win',
      p_source_kind := 'tournament_commission',
      p_source_ref := p_tournament_id::text,
      p_description := 'tournament commission payout',
      p_meta := jsonb_build_object(
        'tournament_id', p_tournament_id,
        'payout_id', r_pay.id,
        'entry_id', r_pay.entry_id
      ),
      p_allow_negative := false
    );

    UPDATE public.tournament_commission_payouts
       SET status = 'paid',
           paid_at = v_now
     WHERE id = r_pay.id;

    IF r_pay.role IN ('agent', 'super') THEN
      v_entry_ids := array_append(v_entry_ids, r_pay.entry_id);
    END IF;
  END LOOP;

  IF v_entry_ids IS NOT NULL AND cardinality(v_entry_ids) > 0 THEN
    FOR r_pay IN
      SELECT DISTINCT unnest(v_entry_ids) AS entry_id
    LOOP
      PERFORM game_finance.fn_apply_commission_daily_stats_from_tournament_entry(r_pay.entry_id, v_now);
    END LOOP;
  END IF;

  RETURN;
END;
$$;

ALTER TABLE public.commission_stat_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY commission_daily_stats_admin_read
  ON public.commission_daily_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'::public.user_role
    )
  );

CREATE POLICY commission_daily_stats_agent_read
  ON public.commission_daily_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'agent'::public.user_role
        AND commission_daily_stats.user_id = u.id
        AND commission_daily_stats.role = 'agent'
    )
  );

CREATE POLICY commission_daily_stats_super_read
  ON public.commission_daily_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'super'::public.user_role
        AND commission_daily_stats.user_id = u.id
        AND commission_daily_stats.role = 'super'
    )
  );

CREATE POLICY commission_stat_events_admin_read
  ON public.commission_stat_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'::public.user_role
    )
  );

REVOKE ALL ON TABLE public.commission_stat_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_daily_stats FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.commission_daily_stats TO authenticated;
GRANT SELECT ON TABLE public.commission_stat_events TO authenticated;

REVOKE ALL ON FUNCTION game_finance.fn_apply_commission_daily_stats(
  text, uuid, timestamptz, text, text, numeric, numeric, uuid, uuid, numeric, numeric
) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_finance.fn_apply_commission_daily_stats_from_ticket(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_finance.fn_apply_commission_daily_stats_from_tournament_entry(uuid, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION game_finance.fn_apply_commission_daily_stats(
  text, uuid, timestamptz, text, text, numeric, numeric, uuid, uuid, numeric, numeric
) TO service_role;
GRANT EXECUTE ON FUNCTION game_finance.fn_apply_commission_daily_stats_from_ticket(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION game_finance.fn_apply_commission_daily_stats_from_tournament_entry(uuid, timestamptz) TO service_role;

-- Backfill from existing settled ticket commissions.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM public.commissions_log
    WHERE status = 'settled'
    ORDER BY COALESCE(distributed_at, created_at), id
  LOOP
    PERFORM game_finance.fn_apply_commission_daily_stats_from_ticket(
      r.ticket_id,
      COALESCE(r.distributed_at, r.created_at)
    );
  END LOOP;
END
$$;

-- Backfill tournament entries with paid agent/super payouts.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (s.entry_id)
      s.entry_id,
      (
        SELECT max(p.paid_at)
        FROM public.tournament_commission_payouts p
        WHERE p.entry_id = s.entry_id
          AND p.status = 'paid'
      ) AS settled_at
    FROM public.tournament_commission_snapshots s
    WHERE EXISTS (
      SELECT 1
      FROM public.tournament_commission_payouts p
      WHERE p.entry_id = s.entry_id
        AND p.status = 'paid'
        AND p.role IN ('agent', 'super')
    )
    ORDER BY s.entry_id
  LOOP
    PERFORM game_finance.fn_apply_commission_daily_stats_from_tournament_entry(
      r.entry_id,
      r.settled_at
    );
  END LOOP;
END
$$;

COMMIT;
