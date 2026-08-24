-- Allow one running auto-buy session per user per room template (not globally per user).

BEGIN;

DROP INDEX IF EXISTS public.player_auto_buy_sessions_one_running_per_user_idx;

CREATE UNIQUE INDEX IF NOT EXISTS player_auto_buy_sessions_one_running_per_user_template_idx
  ON public.player_auto_buy_sessions (user_id, template_id)
  WHERE status = 'running';

CREATE OR REPLACE FUNCTION public.fn_player_auto_buy_start(
  p_user_id uuid,
  p_template_id uuid,
  p_fund numeric,
  p_card_count integer,
  p_profit_target numeric,
  p_idempotency_key text DEFAULT NULL,
  p_skip_first_join boolean DEFAULT false,
  p_serial_buy boolean DEFAULT false,
  p_anchor_room_id uuid DEFAULT NULL
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
  v_anchor uuid;
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
        'last_room_id', v_existing.last_room_id,
        'serial_buy_enabled', v_existing.serial_buy_enabled,
        'anchor_room_id', v_existing.anchor_room_id,
        'serial_next_room_id', v_existing.serial_next_room_id
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

  v_anchor := NULL;
  IF p_serial_buy AND p_anchor_room_id IS NOT NULL THEN
    SELECT r.id INTO v_anchor
    FROM public.rooms r
    WHERE r.id = p_anchor_room_id
      AND r.room_template_id = p_template_id;

    IF v_anchor IS NULL THEN
      RAISE EXCEPTION 'anchor room not found for template';
    END IF;
  END IF;

  INSERT INTO public.player_auto_buy_sessions (
    user_id, template_id, card_count, fund_initial, profit_target,
    fund_remaining, currency, idempotency_key,
    serial_buy_enabled, anchor_room_id
  )
  VALUES (
    p_user_id, p_template_id, p_card_count, p_fund, p_profit_target,
    p_fund, v_template.currency, v_key,
    COALESCE(p_serial_buy, false), v_anchor
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
    'last_room_id', v_existing.last_room_id,
    'serial_buy_enabled', v_existing.serial_buy_enabled,
    'anchor_room_id', v_existing.anchor_room_id,
    'serial_next_room_id', v_existing.serial_next_room_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_player_auto_buy_stop(
  p_user_id uuid,
  p_template_id uuid DEFAULT NULL
)
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
    AND (p_template_id IS NULL OR template_id = p_template_id)
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('stopped', false, 'reason', 'no_running_session');
  END IF;

  PERFORM game_core.fn_auto_buy_finish_session(v_session.id, 'stopped'::public.player_auto_buy_status, 'user_stop');

  RETURN jsonb_build_object(
    'stopped', true,
    'session_id', v_session.id,
    'template_id', v_session.template_id,
    'status', 'stopped'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_player_auto_buy_stop(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_player_auto_buy_stop(uuid, uuid) TO postgres, service_role;

COMMIT;
