-- Migration: align commission log column usage
-- Date: 2025-12-02

BEGIN;

-- این migration فقط توابع مالی را با نام ستون‌های فعلی جدول commissions_log (player_id/agent_id/super_id) هماهنگ می‌کند.

CREATE OR REPLACE FUNCTION game_finance.fn_record_ticket_commission(p_ticket uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_room uuid;
  v_player uuid;
  v_price numeric;
  v_rate_room numeric := 0;
  v_total_comm numeric := 0;
  v_agent uuid;
  v_super uuid;
  v_agent_rate numeric := 0;
  v_super_rate numeric := 0;
  v_agent_amount numeric := 0;
  v_super_amount numeric := 0;
  v_admin_amount numeric := 0;
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.commissions_log WHERE ticket_id = p_ticket;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT t.room_id, t.player_user_id, t.price
    INTO v_room, v_player, v_price
  FROM public.tickets t
  WHERE t.id = p_ticket
    AND t.reservation_status = 'consumed'::reservation_status;

  IF v_room IS NULL OR v_price IS NULL THEN
    RAISE EXCEPTION 'ticket % not found or not consumed', p_ticket;
  END IF;

  SELECT COALESCE(r.commission_rate, rt.commission_rate, 0)
    INTO v_rate_room
  FROM public.rooms r
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = v_room;

  IF v_rate_room > 1 THEN
    v_rate_room := v_rate_room / 100;
  END IF;

  SELECT pa.agent_id, pa.super_id
    INTO v_agent, v_super
  FROM public.player_affiliation pa
  WHERE pa.user_id = v_player;

  IF v_agent IS NOT NULL THEN
    SELECT COALESCE(uc.agent_commission,0) INTO v_agent_rate
    FROM public.user_commissions uc WHERE uc.user_id = v_agent;
    IF v_agent_rate > 1 THEN
      v_agent_rate := v_agent_rate / 100;
    END IF;
  END IF;

  IF v_super IS NOT NULL THEN
    SELECT COALESCE(uc.super_commission,0) INTO v_super_rate
    FROM public.user_commissions uc WHERE uc.user_id = v_super;
    IF v_super_rate > 1 THEN
      v_super_rate := v_super_rate / 100;
    END IF;
  END IF;

  v_total_comm   := CEIL(v_price * v_rate_room);
  v_agent_amount := CEIL(v_total_comm * v_agent_rate);
  v_super_amount := CEIL(v_total_comm * GREATEST(v_super_rate - v_agent_rate, 0));
  v_admin_amount := GREATEST(v_total_comm - v_agent_amount - v_super_amount, 0);

  INSERT INTO public.commissions_log(
    ticket_id, room_id, player_id,
    gross_amount, commission_rate, commission_base,
    agent_id, super_id,
    agent_rate, super_rate,
    agent_amount, super_amount, admin_amount
  ) VALUES (
    p_ticket, v_room, v_player,
    v_price, v_rate_room, v_total_comm,
    v_agent, v_super,
    COALESCE(v_agent_rate,0), COALESCE(v_super_rate,0),
    v_agent_amount, v_super_amount, v_admin_amount
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

ALTER FUNCTION game_finance.fn_record_ticket_commission(p_ticket uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION game_finance.fn_distribute_ticket_commission(p_ticket uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  c record;
  v_currency text;
  v_admin_user uuid;
  v_rollup_amount numeric := 0;
  v_prize_part numeric := 0;
  v_transaction_id uuid;
BEGIN
  SELECT * INTO c
  FROM public.commissions_log
  WHERE ticket_id = p_ticket;

  IF NOT FOUND THEN
    PERFORM game_finance.fn_record_ticket_commission(p_ticket);
    SELECT * INTO c FROM public.commissions_log WHERE ticket_id = p_ticket;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'commission log not found for ticket %', p_ticket;
    END IF;
  END IF;

  IF c.distributed_at IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT currency INTO v_currency
  FROM public.rooms
  WHERE id = c.room_id;

  SELECT u.id INTO v_admin_user
  FROM public.users u
  WHERE u.role = 'admin'
  LIMIT 1;

  IF c.agent_id IS NOT NULL AND c.agent_amount > 0 THEN
    BEGIN
      SELECT game_finance.fn_wallet_apply_delta(
        p_user_id := c.agent_id,
        p_currency := v_currency,
        p_amount_delta := c.agent_amount,
        p_transaction_type := 'fee_agent',
        p_source_kind := 'ticket_commission',
        p_source_ref := NULL,
        p_description := 'ticket commission (agent)',
        p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
        p_allow_negative := false
      ) INTO v_transaction_id;
    EXCEPTION
      WHEN OTHERS THEN
        v_rollup_amount := v_rollup_amount + c.agent_amount;
    END;
  END IF;

  IF c.super_id IS NOT NULL AND c.super_amount > 0 THEN
    BEGIN
      SELECT game_finance.fn_wallet_apply_delta(
        p_user_id := c.super_id,
        p_currency := v_currency,
        p_amount_delta := c.super_amount,
        p_transaction_type := 'fee_super',
        p_source_kind := 'ticket_commission',
        p_source_ref := NULL,
        p_description := 'ticket commission (super)',
        p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
        p_allow_negative := false
      ) INTO v_transaction_id;
    EXCEPTION
      WHEN OTHERS THEN
        v_rollup_amount := v_rollup_amount + c.super_amount;
    END;
  END IF;

  IF (c.admin_amount + v_rollup_amount) > 0 AND v_admin_user IS NOT NULL THEN
    SELECT game_finance.fn_wallet_apply_delta(
      p_user_id := v_admin_user,
      p_currency := v_currency,
      p_amount_delta := c.admin_amount + v_rollup_amount,
      p_transaction_type := 'fee_admin',
      p_source_kind := 'ticket_commission',
      p_source_ref := NULL,
      p_description := 'ticket commission (admin remainder)',
      p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
      p_allow_negative := false
    ) INTO v_transaction_id;
  END IF;

  v_prize_part := GREATEST(c.price - c.total_commission, 0);
  UPDATE public.rooms
     SET line_prize_pool = line_prize_pool + v_prize_part,
         updated_at = now()
   WHERE id = c.room_id;

  UPDATE public.commissions_log
     SET distributed_at = now(),
         admin_amount = c.admin_amount + v_rollup_amount
   WHERE id = c.id;
END;
$function$;

ALTER FUNCTION game_finance.fn_distribute_ticket_commission(p_ticket uuid) OWNER TO postgres;

COMMIT;


