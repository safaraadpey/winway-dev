-- Player auto-buy: server-side rebuy sessions for a room template (survives logout).

BEGIN;

CREATE TYPE public.player_auto_buy_status AS ENUM (
  'running',
  'stopped',
  'fund_empty',
  'profit_hit'
);

CREATE TABLE IF NOT EXISTS public.player_auto_buy_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.room_templates(id),
  card_count integer NOT NULL CHECK (card_count >= 1),
  fund_initial numeric(14, 2) NOT NULL CHECK (fund_initial > 0),
  profit_target numeric(14, 2) NOT NULL,
  fund_remaining numeric(14, 2) NOT NULL,
  status public.player_auto_buy_status NOT NULL DEFAULT 'running',
  currency text NOT NULL DEFAULT 'IRR',
  last_room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  last_finished_room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  stop_reason text,
  idempotency_key text,
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_auto_buy_profit_target_gt_fund CHECK (profit_target > fund_initial),
  CONSTRAINT player_auto_buy_fund_remaining_nonneg CHECK (fund_remaining >= 0)
);

COMMENT ON TABLE public.player_auto_buy_sessions IS
  'Server-side auto-rebuy bankroll per user+template; independent of client session.';

CREATE UNIQUE INDEX IF NOT EXISTS player_auto_buy_sessions_one_running_per_user_template_idx
  ON public.player_auto_buy_sessions (user_id, template_id)
  WHERE status = 'running';

CREATE UNIQUE INDEX IF NOT EXISTS player_auto_buy_sessions_idempotency_key_uidx
  ON public.player_auto_buy_sessions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS player_auto_buy_sessions_template_running_idx
  ON public.player_auto_buy_sessions (template_id, status)
  WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.player_auto_buy_round_locks (
  session_id uuid NOT NULL REFERENCES public.player_auto_buy_sessions(id) ON DELETE CASCADE,
  finished_room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, finished_room_id)
);

-- ---------------------------------------------------------------------------
-- Escrow helpers (dedicated auto-buy pool — NOT fn_wallet_hold_join)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION game_finance.fn_auto_buy_escrow_deposit(
  p_user uuid,
  p_amount numeric,
  p_currency text,
  p_session_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_finance
AS $$
DECLARE
  v_wallet uuid;
  v_balance numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'auto_buy escrow amount must be positive';
  END IF;

  SELECT id, balance
    INTO v_wallet, v_balance
  FROM public.wallets
  WHERE user_id = p_user
    AND currency = p_currency
  FOR UPDATE;

  IF v_wallet IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  PERFORM game_finance.fn_wallet_apply_delta(
    p_user_id := p_user,
    p_currency := p_currency,
    p_amount_delta := -p_amount,
    p_transaction_type := 'join_hold',
    p_source_kind := 'auto_buy_escrow',
    p_source_ref := p_session_id::text,
    p_description := 'auto-buy fund escrow',
    p_meta := jsonb_build_object('session_id', p_session_id, 'phase', 'deposit'),
    p_allow_negative := false,
    p_idempotency_key := p_idempotency_key
  );

  UPDATE public.wallets
     SET locked_amount = locked_amount + p_amount,
         updated_at = now()
   WHERE id = v_wallet;
END;
$$;

CREATE OR REPLACE FUNCTION game_finance.fn_auto_buy_escrow_release(
  p_user uuid,
  p_amount numeric,
  p_currency text,
  p_session_id uuid,
  p_reason text DEFAULT 'stop'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_finance
AS $$
DECLARE
  v_wallet uuid;
  v_locked numeric;
  v_release numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  SELECT id, locked_amount
    INTO v_wallet, v_locked
  FROM public.wallets
  WHERE user_id = p_user
    AND currency = p_currency
  FOR UPDATE;

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'wallet not found';
  END IF;

  v_release := LEAST(p_amount, GREATEST(v_locked, 0));
  IF v_release <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.wallets
     SET locked_amount = GREATEST(locked_amount - v_release, 0),
         balance = balance + v_release,
         updated_at = now()
   WHERE id = v_wallet;

  INSERT INTO public.transactions (
    id, wallet_id, user_id, type, status, amount, currency, description,
    balance_before, balance_after, source_kind, source_ref, created_at
  )
  SELECT
    gen_random_uuid(),
    w.id,
    p_user,
    'join_refund'::public.transaction_type,
    'completed'::public.transaction_status,
    v_release,
    p_currency,
    'auto-buy fund release: ' || p_reason,
    w.balance - v_release,
    w.balance,
    'auto_buy_escrow',
    p_session_id::text,
    now()
  FROM public.wallets w
  WHERE w.id = v_wallet;
END;
$$;

CREATE OR REPLACE FUNCTION game_finance.fn_auto_buy_escrow_unwrap_for_join(
  p_user uuid,
  p_amount numeric,
  p_currency text,
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_finance
AS $$
DECLARE
  v_wallet uuid;
  v_locked numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'join amount must be positive';
  END IF;

  SELECT id, locked_amount
    INTO v_wallet, v_locked
  FROM public.wallets
  WHERE user_id = p_user
    AND currency = p_currency
  FOR UPDATE;

  IF v_wallet IS NULL OR v_locked < p_amount THEN
    RAISE EXCEPTION 'insufficient auto-buy escrow';
  END IF;

  UPDATE public.wallets
     SET locked_amount = locked_amount - p_amount,
         balance = balance + p_amount,
         updated_at = now()
   WHERE id = v_wallet;

  INSERT INTO public.transactions (
    id, wallet_id, user_id, type, status, amount, currency, description,
    balance_before, balance_after, source_kind, source_ref, created_at
  )
  SELECT
    gen_random_uuid(),
    w.id,
    p_user,
    'join_refund'::public.transaction_type,
    'completed'::public.transaction_status,
    p_amount,
    p_currency,
    'auto-buy unwrap for join',
    w.balance - p_amount,
    w.balance,
    'auto_buy_escrow',
    p_session_id::text,
    now()
  FROM public.wallets w
  WHERE w.id = v_wallet;
END;
$$;

CREATE OR REPLACE FUNCTION game_finance.fn_auto_buy_escrow_wrap_prize(
  p_user uuid,
  p_amount numeric,
  p_currency text,
  p_session_id uuid,
  p_room_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_finance
AS $$
DECLARE
  v_wallet uuid;
  v_balance numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  SELECT id, balance
    INTO v_wallet, v_balance
  FROM public.wallets
  WHERE user_id = p_user
    AND currency = p_currency
  FOR UPDATE;

  IF v_wallet IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient balance to wrap prize';
  END IF;

  PERFORM game_finance.fn_wallet_apply_delta(
    p_user_id := p_user,
    p_currency := p_currency,
    p_amount_delta := -p_amount,
    p_transaction_type := 'join_hold',
    p_source_kind := 'auto_buy_escrow',
    p_source_ref := p_session_id::text,
    p_description := 'auto-buy prize re-escrow',
    p_meta := jsonb_build_object('session_id', p_session_id, 'room_id', p_room_id, 'phase', 'prize_wrap'),
    p_allow_negative := false
  );

  UPDATE public.wallets
     SET locked_amount = locked_amount + p_amount,
         updated_at = now()
   WHERE id = v_wallet;
END;
$$;

-- ---------------------------------------------------------------------------
-- Core auto-buy logic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION game_core.fn_auto_buy_user_has_active_tickets(
  p_user_id uuid,
  p_template_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tickets t
    JOIN public.rooms r ON r.id = t.room_id
    WHERE t.player_user_id = p_user_id
      AND r.room_template_id = p_template_id
      AND r.status IN ('waiting'::public.room_status, 'playing'::public.room_status, 'settling'::public.room_status)
      AND t.reservation_status IN ('reserved'::public.reservation_status, 'confirmed'::public.reservation_status)
  );
$$;

CREATE OR REPLACE FUNCTION game_core.fn_auto_buy_finish_session(
  p_session_id uuid,
  p_status public.player_auto_buy_status,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_finance
AS $$
DECLARE
  v_session public.player_auto_buy_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.player_auto_buy_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'running' THEN
    RETURN;
  END IF;

  PERFORM game_finance.fn_auto_buy_escrow_release(
    v_session.user_id,
    v_session.fund_remaining,
    v_session.currency,
    v_session.id,
    p_reason
  );

  UPDATE public.player_auto_buy_sessions
     SET status = p_status,
         stop_reason = p_reason,
         fund_remaining = 0,
         stopped_at = now(),
         updated_at = now()
   WHERE id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION game_core.fn_auto_buy_try_join(
  p_session_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
AS $$
DECLARE
  v_session public.player_auto_buy_sessions%ROWTYPE;
  v_price numeric;
  v_join_cost numeric;
  v_room_id uuid;
  v_starts_at timestamptz;
  v_ticket_ids uuid[];
BEGIN
  SELECT * INTO v_session
  FROM public.player_auto_buy_sessions
  WHERE id = p_session_id
    AND status = 'running'::public.player_auto_buy_status
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF game_core.fn_auto_buy_user_has_active_tickets(v_session.user_id, v_session.template_id) THEN
    RETURN NULL;
  END IF;

  SELECT rt.price, rt.currency
    INTO v_price, v_session.currency
  FROM public.room_templates rt
  WHERE rt.id = v_session.template_id
    AND rt.status = 'active'::public.room_template_status;

  IF v_price IS NULL THEN
    PERFORM game_core.fn_auto_buy_finish_session(p_session_id, 'stopped'::public.player_auto_buy_status, 'template_inactive');
    RETURN NULL;
  END IF;

  v_join_cost := v_price * v_session.card_count;

  IF v_session.fund_remaining < v_join_cost THEN
    PERFORM game_core.fn_auto_buy_finish_session(p_session_id, 'fund_empty'::public.player_auto_buy_status, 'fund_empty');
    RETURN NULL;
  END IF;

  IF v_session.fund_remaining >= v_session.profit_target THEN
    PERFORM game_core.fn_auto_buy_finish_session(p_session_id, 'profit_hit'::public.player_auto_buy_status, 'profit_hit');
    RETURN NULL;
  END IF;

  PERFORM game_finance.fn_auto_buy_escrow_unwrap_for_join(
    v_session.user_id,
    v_join_cost,
    v_session.currency,
    v_session.id
  );

  BEGIN
    SELECT j.room_id, j.starts_at, j.ticket_ids
      INTO v_room_id, v_starts_at, v_ticket_ids
    FROM game_core.fn_system_join_or_create_room(
      v_session.user_id,
      v_session.template_id,
      v_session.card_count,
      NULL
    ) AS j
    LIMIT 1;

    UPDATE public.player_auto_buy_sessions
       SET fund_remaining = fund_remaining - v_join_cost,
           last_room_id = v_room_id,
           updated_at = now()
     WHERE id = p_session_id;

    RETURN v_room_id;
  EXCEPTION
    WHEN OTHERS THEN
      -- Re-wrap join cost back into escrow
      PERFORM game_finance.fn_auto_buy_escrow_deposit(
        v_session.user_id,
        v_join_cost,
        v_session.currency,
        v_session.id,
        NULL
      );
      RAISE;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auto_buy_after_room_finished(p_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
AS $$
DECLARE
  v_template_id uuid;
  r_session record;
  v_lock_session_id uuid;
  v_prize numeric;
  v_price numeric;
  v_join_cost numeric;
BEGIN
  SELECT r.room_template_id INTO v_template_id
  FROM public.rooms r
  WHERE r.id = p_room;

  IF v_template_id IS NULL THEN
    RETURN;
  END IF;

  FOR r_session IN
    SELECT s.*
    FROM public.player_auto_buy_sessions s
    WHERE s.status = 'running'::public.player_auto_buy_status
      AND s.template_id = v_template_id
      AND EXISTS (
        SELECT 1
        FROM public.tickets t
        WHERE t.room_id = p_room
          AND t.player_user_id = s.user_id
          AND t.reservation_status IN (
            'reserved'::public.reservation_status,
            'confirmed'::public.reservation_status,
            'consumed'::public.reservation_status
          )
      )
  LOOP
    BEGIN
      v_lock_session_id := NULL;
      INSERT INTO public.player_auto_buy_round_locks (session_id, finished_room_id)
      VALUES (r_session.id, p_room)
      ON CONFLICT DO NOTHING
      RETURNING session_id INTO v_lock_session_id;

      IF v_lock_session_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(SUM(t.amount), 0)
        INTO v_prize
      FROM public.transactions t
      WHERE t.user_id = r_session.user_id
        AND t.room_id = p_room
        AND t.type = 'win'::public.transaction_type
        AND t.status = 'completed'::public.transaction_status;

      IF v_prize > 0 THEN
        PERFORM game_finance.fn_auto_buy_escrow_wrap_prize(
          r_session.user_id,
          v_prize,
          r_session.currency,
          r_session.id,
          p_room
        );

        UPDATE public.player_auto_buy_sessions
           SET fund_remaining = fund_remaining + v_prize,
               last_finished_room_id = p_room,
               last_room_id = p_room,
               updated_at = now()
         WHERE id = r_session.id;
      ELSE
        UPDATE public.player_auto_buy_sessions
           SET last_finished_room_id = p_room,
               last_room_id = p_room,
               updated_at = now()
         WHERE id = r_session.id;
      END IF;

      SELECT fund_remaining, profit_target, card_count, template_id
        INTO r_session.fund_remaining, r_session.profit_target, r_session.card_count, r_session.template_id
      FROM public.player_auto_buy_sessions
      WHERE id = r_session.id;

      SELECT price INTO v_price
      FROM public.room_templates
      WHERE id = r_session.template_id;

      v_join_cost := COALESCE(v_price, 0) * r_session.card_count;

      IF r_session.fund_remaining >= r_session.profit_target THEN
        PERFORM game_core.fn_auto_buy_finish_session(r_session.id, 'profit_hit'::public.player_auto_buy_status, 'profit_hit');
        CONTINUE;
      END IF;

      IF r_session.fund_remaining < v_join_cost THEN
        PERFORM game_core.fn_auto_buy_finish_session(r_session.id, 'fund_empty'::public.player_auto_buy_status, 'fund_empty');
        CONTINUE;
      END IF;

      IF NOT game_core.fn_auto_buy_user_has_active_tickets(r_session.user_id, r_session.template_id) THEN
        PERFORM game_core.fn_auto_buy_try_join(r_session.id);
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '[AutoBuy] after_room_finished session=% room=% err=%',
          r_session.id, p_room, SQLERRM;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auto_buy_recover_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core
AS $$
DECLARE
  r_session record;
  v_count integer := 0;
  v_price numeric;
  v_join_cost numeric;
BEGIN
  FOR r_session IN
    SELECT s.*
    FROM public.player_auto_buy_sessions s
    WHERE s.status = 'running'::public.player_auto_buy_status
      AND NOT game_core.fn_auto_buy_user_has_active_tickets(s.user_id, s.template_id)
  LOOP
    BEGIN
      SELECT price INTO v_price
      FROM public.room_templates
      WHERE id = r_session.template_id
        AND status = 'active'::public.room_template_status;

      IF v_price IS NULL THEN
        CONTINUE;
      END IF;

      v_join_cost := v_price * r_session.card_count;

      IF r_session.fund_remaining >= r_session.profit_target THEN
        PERFORM game_core.fn_auto_buy_finish_session(r_session.id, 'profit_hit'::public.player_auto_buy_status, 'profit_hit');
        v_count := v_count + 1;
        CONTINUE;
      END IF;

      IF r_session.fund_remaining < v_join_cost THEN
        PERFORM game_core.fn_auto_buy_finish_session(r_session.id, 'fund_empty'::public.player_auto_buy_status, 'fund_empty');
        v_count := v_count + 1;
        CONTINUE;
      END IF;

      IF game_core.fn_auto_buy_try_join(r_session.id) IS NOT NULL THEN
        v_count := v_count + 1;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '[AutoBuy] recover_due session=% err=%', r_session.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_player_auto_buy_start(
  p_user_id uuid,
  p_template_id uuid,
  p_fund numeric,
  p_card_count integer,
  p_profit_target numeric,
  p_idempotency_key text DEFAULT NULL,
  p_skip_first_join boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
AS $$
DECLARE
  v_existing public.player_auto_buy_sessions%ROWTYPE;
  v_template record;
  v_session_id uuid;
  v_join_cost numeric;
  v_room_id uuid;
  v_key text;
BEGIN
  IF p_user_id IS NULL OR p_template_id IS NULL THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  IF p_fund IS NULL OR p_fund <= 0 OR p_card_count IS NULL OR p_card_count < 1 THEN
    RAISE EXCEPTION 'invalid fund or card count';
  END IF;

  IF p_profit_target IS NULL OR p_profit_target <= p_fund THEN
    RAISE EXCEPTION 'profit target must exceed fund';
  END IF;

  v_key := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.player_auto_buy_sessions
    WHERE idempotency_key = v_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'session_id', v_existing.id,
        'status', v_existing.status,
        'fund_remaining', v_existing.fund_remaining,
        'profit_target', v_existing.profit_target,
        'card_count', v_existing.card_count,
        'last_room_id', v_existing.last_room_id
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.player_auto_buy_sessions
    WHERE user_id = p_user_id
      AND template_id = p_template_id
      AND status = 'running'::public.player_auto_buy_status
  ) THEN
    RAISE EXCEPTION 'auto_buy session already running for template';
  END IF;

  SELECT rt.id, rt.price, rt.currency, rt.room_type, rt.password, rt.status, rt.max_cards_per_player
    INTO v_template
  FROM public.room_templates rt
  WHERE rt.id = p_template_id;

  IF v_template.id IS NULL OR v_template.status <> 'active'::public.room_template_status THEN
    RAISE EXCEPTION 'template not found or inactive';
  END IF;

  IF v_template.room_type = 'tournament'::public.room_type THEN
    RAISE EXCEPTION 'auto_buy not allowed for tournament rooms';
  END IF;

  IF v_template.password IS NOT NULL AND length(btrim(v_template.password)) > 0 THEN
    RAISE EXCEPTION 'auto_buy not allowed for password rooms';
  END IF;

  v_join_cost := v_template.price * p_card_count;
  IF p_fund < v_join_cost THEN
    RAISE EXCEPTION 'fund must cover at least one round';
  END IF;

  IF p_card_count > COALESCE(v_template.max_cards_per_player, 999999) THEN
    RAISE EXCEPTION 'max_cards_per_player exceeded';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.app_runtime_flags arf
    WHERE arf.id = true
      AND COALESCE(arf.global_registration_locked, false)
  ) THEN
    RAISE EXCEPTION 'global registration locked';
  END IF;

  INSERT INTO public.player_auto_buy_sessions (
    user_id, template_id, card_count, fund_initial, profit_target,
    fund_remaining, currency, idempotency_key
  )
  VALUES (
    p_user_id, p_template_id, p_card_count, p_fund, p_profit_target,
    p_fund, v_template.currency, v_key
  )
  RETURNING id INTO v_session_id;

  PERFORM game_finance.fn_auto_buy_escrow_deposit(
    p_user_id,
    p_fund,
    v_template.currency,
    v_session_id,
    CASE WHEN v_key IS NOT NULL THEN v_key || ':escrow' ELSE NULL END
  );

  IF NOT p_skip_first_join
     AND NOT game_core.fn_auto_buy_user_has_active_tickets(p_user_id, p_template_id) THEN
    v_room_id := game_core.fn_auto_buy_try_join(v_session_id);
  END IF;

  SELECT * INTO v_existing FROM public.player_auto_buy_sessions WHERE id = v_session_id;

  RETURN jsonb_build_object(
    'session_id', v_existing.id,
    'status', v_existing.status,
    'fund_remaining', v_existing.fund_remaining,
    'profit_target', v_existing.profit_target,
    'card_count', v_existing.card_count,
    'fund_initial', v_existing.fund_initial,
    'last_room_id', v_existing.last_room_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_player_auto_buy_stop(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core
AS $$
DECLARE
  v_session public.player_auto_buy_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.player_auto_buy_sessions
  WHERE user_id = p_user_id
    AND status = 'running'::public.player_auto_buy_status
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('stopped', false, 'reason', 'no_running_session');
  END IF;

  PERFORM game_core.fn_auto_buy_finish_session(v_session.id, 'stopped'::public.player_auto_buy_status, 'user_stop');

  RETURN jsonb_build_object(
    'stopped', true,
    'session_id', v_session.id,
    'status', 'stopped'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_player_auto_buy_snapshot(
  p_user_id uuid,
  p_template_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_session public.player_auto_buy_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.player_auto_buy_sessions s
  WHERE s.user_id = p_user_id
    AND (p_template_id IS NULL OR s.template_id = p_template_id)
  ORDER BY
    CASE WHEN s.status = 'running'::public.player_auto_buy_status THEN 0 ELSE 1 END,
    s.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('active', false);
  END IF;

  RETURN jsonb_build_object(
    'active', v_session.status = 'running'::public.player_auto_buy_status,
    'session_id', v_session.id,
    'template_id', v_session.template_id,
    'status', v_session.status,
    'card_count', v_session.card_count,
    'fund_initial', v_session.fund_initial,
    'fund_remaining', v_session.fund_remaining,
    'profit_target', v_session.profit_target,
    'last_room_id', v_session.last_room_id,
    'stop_reason', v_session.stop_reason,
    'started_at', v_session.started_at,
    'stopped_at', v_session.stopped_at
  );
END;
$$;

-- Hook into settlement (must not fail settlement)
CREATE OR REPLACE FUNCTION game_finance.fn_finish_room_and_settle(
  p_room uuid,
  p_admin_user uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_finance
AS $$
DECLARE
  v_room record;
  v_now timestamptz := now();
  rec_ticket record;
  rec_comm record;
  rec_result record;
  v_total_pool numeric := 0;
  v_line_pct numeric;
  v_full_pct numeric;
  v_line_pool numeric := 0;
  v_full_pool numeric := 0;
  v_line_winners integer := 0;
  v_full_winners integer := 0;
  v_line_share numeric := 0;
  v_full_share numeric := 0;
  v_currency text;
BEGIN
  SELECT r.*,
         COALESCE(r.line_reward_percentage, rt.line_reward_percentage, 0.5) AS __line_pct,
         COALESCE(r.full_reward_percentage, rt.full_reward_percentage, 0.5) AS __full_pct
    INTO v_room
  FROM public.rooms r
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = p_room
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room % not found', p_room;
  END IF;

  IF v_room.status = 'finished' THEN
    RAISE NOTICE 'fn_finish_room_and_settle: room % already finished', p_room;
    RETURN;
  END IF;

  IF v_room.status <> 'settling' THEN
    RAISE EXCEPTION 'room % is not settling (status=%)', p_room, v_room.status;
  END IF;

  v_currency := v_room.currency;
  v_line_pct := GREATEST(COALESCE(v_room.__line_pct, 0), 0);
  v_full_pct := GREATEST(COALESCE(v_room.__full_pct, 0), 0);

  IF v_line_pct = 0 AND v_full_pct = 0 THEN
    v_line_pct := 0.5;
    v_full_pct := 0.5;
  END IF;

  IF (v_line_pct + v_full_pct) > 1 THEN
    v_line_pct := v_line_pct / (v_line_pct + v_full_pct);
    v_full_pct := 1 - v_line_pct;
  END IF;

  FOR rec_ticket IN
    WITH updated AS (
      UPDATE public.tickets
         SET reservation_status = 'consumed'::public.reservation_status,
             updated_at = v_now
       WHERE room_id = p_room
         AND reservation_status IN ('reserved','confirmed')
       RETURNING id, player_user_id, price
    )
    SELECT * FROM updated
  LOOP
    PERFORM game_finance.fn_wallet_capture_join(
      rec_ticket.player_user_id,
      rec_ticket.price,
      v_currency,
      p_room,
      rec_ticket.id
    );
  END LOOP;

  FOR rec_comm IN
    SELECT ticket_id
      FROM public.commissions_log
     WHERE room_id = p_room
       AND status = 'pending'
     FOR UPDATE
  LOOP
    v_total_pool := v_total_pool + COALESCE(game_finance.fn_distribute_ticket_commission(rec_comm.ticket_id, p_admin_user), 0);
  END LOOP;

  v_line_pool := ROUND(v_total_pool * v_line_pct, 2);
  v_full_pool := ROUND(v_total_pool - v_line_pool, 2);

  SELECT COUNT(*)
    INTO v_line_winners
  FROM public.results
  WHERE room_id = p_room
    AND win_type = 'line'
    AND paid_at IS NULL;

  SELECT COUNT(*)
    INTO v_full_winners
  FROM public.results
  WHERE room_id = p_room
    AND win_type = 'full'
    AND paid_at IS NULL;

  IF v_line_winners = 0 THEN
    v_full_pool := v_full_pool + v_line_pool;
    v_line_pool := 0;
  END IF;

  IF v_line_winners > 0 THEN
    v_line_share := CASE WHEN v_line_pool > 0 THEN ROUND(v_line_pool / v_line_winners, 2) ELSE 0 END;

    FOR rec_result IN
      SELECT id, user_id, ticket_id
      FROM public.results
      WHERE room_id = p_room
        AND win_type = 'line'
        AND paid_at IS NULL
      FOR UPDATE
    LOOP
      IF v_line_share > 0 THEN
        PERFORM game_finance.fn_wallet_apply_delta(
          p_user_id := rec_result.user_id,
          p_currency := v_currency,
          p_amount_delta := v_line_share,
          p_transaction_type := 'win',
          p_source_kind := 'room_settlement',
          p_source_ref := p_room::text,
          p_description := 'room line prize payout',
          p_meta := jsonb_build_object('room_id', p_room, 'ticket_id', rec_result.ticket_id, 'win_type', 'line'),
          p_allow_negative := false
        );
      END IF;

      UPDATE public.results
         SET reward_amount = COALESCE(reward_amount, 0) + v_line_share,
             paid_at = v_now
       WHERE id = rec_result.id;
    END LOOP;
  END IF;

  IF v_full_winners > 0 THEN
    v_full_share := CASE WHEN v_full_pool > 0 THEN ROUND(v_full_pool / v_full_winners, 2) ELSE 0 END;

    FOR rec_result IN
      SELECT id, user_id, ticket_id
      FROM public.results
      WHERE room_id = p_room
        AND win_type = 'full'
        AND paid_at IS NULL
      FOR UPDATE
    LOOP
      IF v_full_share > 0 THEN
        PERFORM game_finance.fn_wallet_apply_delta(
          p_user_id := rec_result.user_id,
          p_currency := v_currency,
          p_amount_delta := v_full_share,
          p_transaction_type := 'win',
          p_source_kind := 'room_settlement',
          p_source_ref := p_room::text,
          p_description := 'room full prize payout',
          p_meta := jsonb_build_object('room_id', p_room, 'ticket_id', rec_result.ticket_id, 'win_type', 'full'),
          p_allow_negative := false
        );
      END IF;

      UPDATE public.results
         SET reward_amount = COALESCE(reward_amount, 0) + v_full_share,
             paid_at = v_now
       WHERE id = rec_result.id;
    END LOOP;
  END IF;

  UPDATE public.rooms
     SET status = 'finished',
         prize_paid_at = v_now,
         line_prize_pool = 0,
         full_prize_pool = 0,
         ends_at = COALESCE(ends_at, v_now),
         updated_at = v_now
   WHERE id = p_room;

  RAISE NOTICE 'room % settled: total_pool=%, line_winners=%, full_winners=%',
    p_room, v_total_pool, v_line_winners, v_full_winners;

  BEGIN
    PERFORM public.fn_auto_buy_after_room_finished(p_room);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[AutoBuy] hook after settle room=% err=%', p_room, SQLERRM;
  END;
END;
$$;

INSERT INTO public.features (key, name, description, is_enabled, default_enabled)
VALUES (
  'auto_buy',
  'Auto Buy',
  'Server-side automatic card rebuy for room templates',
  true,
  true
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.player_auto_buy_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_auto_buy_round_locks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.player_auto_buy_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.player_auto_buy_round_locks FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.player_auto_buy_sessions TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.player_auto_buy_round_locks TO postgres, service_role;

REVOKE ALL ON FUNCTION game_finance.fn_auto_buy_escrow_deposit(uuid, numeric, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_finance.fn_auto_buy_escrow_release(uuid, numeric, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_finance.fn_auto_buy_escrow_unwrap_for_join(uuid, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_finance.fn_auto_buy_escrow_wrap_prize(uuid, numeric, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_core.fn_auto_buy_user_has_active_tickets(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_core.fn_auto_buy_finish_session(uuid, public.player_auto_buy_status, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_core.fn_auto_buy_try_join(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_auto_buy_after_room_finished(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_auto_buy_recover_due() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_player_auto_buy_start(uuid, uuid, numeric, integer, numeric, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_player_auto_buy_stop(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_player_auto_buy_snapshot(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_auto_buy_after_room_finished(uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_auto_buy_recover_due() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_player_auto_buy_start(uuid, uuid, numeric, integer, numeric, text, boolean) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_player_auto_buy_stop(uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_player_auto_buy_snapshot(uuid, uuid) TO postgres, service_role;

COMMIT;
