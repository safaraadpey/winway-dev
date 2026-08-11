-- Migration: add distributed_at to commissions_log and fix distribution function
-- Date: 2025-12-02

BEGIN;

ALTER TABLE public.commissions_log
  ADD COLUMN IF NOT EXISTS distributed_at timestamptz;

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

  v_prize_part := GREATEST(c.gross_amount - c.commission_base, 0);
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


