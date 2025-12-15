-- Migration: Configure admin commission routing
-- Date: 2025-12-04

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
        p_source_ref := NULL,
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
        p_source_ref := NULL,
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
      p_source_ref := NULL,
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

ALTER FUNCTION game_finance.fn_distribute_ticket_commission(uuid, uuid) OWNER TO postgres;


CREATE OR REPLACE FUNCTION game_finance.fn_finish_room_and_settle(
  p_room uuid,
  p_admin_user uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
END;
$function$;

ALTER FUNCTION game_finance.fn_finish_room_and_settle(uuid, uuid) OWNER TO postgres;

COMMIT;
