-- Migration: Ensure commission payouts set source_ref
-- Date: 2025-12-06

BEGIN;

CREATE OR REPLACE FUNCTION game_finance.fn_distribute_ticket_commission(
  p_ticket uuid,
  p_admin_user uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  c record;
  v_currency text;
  v_admin_user uuid;
  v_rollup_amount numeric := 0;
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
     SET distributed_at = now(),
         admin_amount   = c.admin_amount + v_rollup_amount,
         status         = 'settled'
   WHERE id = c.id;

  RETURN GREATEST(COALESCE(c.amount_to_pool, 0), 0);
END;
$function$;

COMMIT;
