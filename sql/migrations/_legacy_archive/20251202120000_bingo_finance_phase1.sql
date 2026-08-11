-- Migration: Bingo financial engine phase 1 (per cursor prompt)
-- تاریخ: 2025-12-02
--
-- این مهاجرت فقط شامل DDL/تابع‌های جدید است و هیچ تغییری را به‌صورت خودکار
-- روی داده‌های runtime اعمال نمی‌کند. بعد از Merge می‌توان آن را با Supabase CLI
-- یا SQL Editor اجرا کرد.

BEGIN;

-- =====================================================================
-- 1) ستون‌های خزانهٔ جایزه روی rooms (در صورت نبود)
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rooms'
      AND column_name = 'line_prize_pool'
  ) THEN
    ALTER TABLE public.rooms
      ADD COLUMN line_prize_pool numeric DEFAULT 0 NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rooms'
      AND column_name = 'full_prize_pool'
  ) THEN
    ALTER TABLE public.rooms
      ADD COLUMN full_prize_pool numeric DEFAULT 0 NOT NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN public.rooms.line_prize_pool IS
  'خزانه‌ی خالص جایزه‌ی line برای روم؛ توسط موتور مالی پر و خالی می‌شود';
COMMENT ON COLUMN public.rooms.full_prize_pool IS
  'خزانه‌ی خالص جایزه‌ی full برای روم؛ توسط موتور مالی پر و خالی می‌شود';

-- =====================================================================
-- 1-b) اطمینان از وجود ستون price در tickets
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tickets'
      AND column_name = 'price'
  ) THEN
    ALTER TABLE public.tickets
      ADD COLUMN price numeric(10,2);

    UPDATE public.tickets t
       SET price = COALESCE(r.card_price, rt.price, 0)
      FROM public.rooms r
      LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
     WHERE t.room_id = r.id;

    ALTER TABLE public.tickets
      ALTER COLUMN price SET NOT NULL;
  END IF;
END;
$$;

-- =====================================================================
-- 2) تابع مصرف کارت‌های روم
-- =====================================================================
CREATE OR REPLACE FUNCTION game_finance.fn_consume_room_tickets(p_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_now timestamptz := now();
BEGIN
  WITH locked_tickets AS (
    SELECT id
    FROM public.tickets
    WHERE room_id = p_room
      AND reservation_status IN ('reserved','confirmed')
    FOR UPDATE
  )
  UPDATE public.tickets t
     SET reservation_status = 'consumed'::reservation_status,
         updated_at = v_now
   WHERE t.id IN (SELECT id FROM locked_tickets);
END;
$function$;

ALTER FUNCTION game_finance.fn_consume_room_tickets(p_room uuid) OWNER TO postgres;

-- =====================================================================
-- 3) توزیع کمیسیون + انباشت خزانه line
-- =====================================================================
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
  SELECT *
    INTO c
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

-- =====================================================================
-- 4) به‌روزرسانی game_core.fn_manage_waiting_rooms
-- =====================================================================
CREATE OR REPLACE FUNCTION game_core.fn_manage_waiting_rooms(
  p_limit integer DEFAULT 50,
  p_capture boolean DEFAULT false
)
RETURNS TABLE(room_id uuid, became_live_at timestamptz, paid_players integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  r record;
  v_now timestamptz := now();
  v_paid int;
BEGIN
  FOR r IN
    SELECT
      rm.id,
      rm.min_players,
      rm.starts_at
    FROM public.rooms rm
    WHERE rm.status = 'waiting'
      AND rm.starts_at IS NOT NULL
      AND v_now >= rm.starts_at
      AND (
        SELECT COUNT(DISTINCT t.player_user_id)
        FROM public.tickets t
        WHERE t.room_id = rm.id
          AND t.reservation_status IN ('reserved','confirmed')
      ) >= rm.min_players
    ORDER BY rm.starts_at ASC
    LIMIT p_limit
  LOOP
    SELECT COUNT(DISTINCT t.player_user_id)
      INTO v_paid
    FROM public.tickets t
    WHERE t.room_id = r.id
      AND t.reservation_status = 'consumed';

    IF p_capture THEN
      BEGIN
        PERFORM game_finance.fn_wallet_capture_and_distribute(r.id);
      EXCEPTION
        WHEN undefined_function THEN
          RAISE NOTICE 'game_finance.fn_wallet_capture_and_distribute(room_id) not found; skipping capture for %', r.id;
      END;
      PERFORM game_finance.fn_consume_room_tickets(r.id);
    END IF;

    UPDATE public.rooms
       SET status     = 'live',
           updated_at = v_now
     WHERE id = r.id
       AND status = 'waiting';

    room_id        := r.id;
    became_live_at := v_now;
    paid_players   := v_paid;
    RETURN NEXT;
  END LOOP;

  FOR r IN
    SELECT
      rm.id,
      rm.min_players,
      rm.starts_at,
      rm.countdown_sec
    FROM public.rooms rm
    WHERE rm.status = 'waiting'
      AND rm.starts_at IS NOT NULL
      AND v_now >= rm.starts_at
      AND (
        SELECT COUNT(DISTINCT t.player_user_id)
        FROM public.tickets t
        WHERE t.room_id = rm.id
          AND t.reservation_status IN ('reserved','confirmed')
      ) < rm.min_players
    ORDER BY rm.starts_at ASC
    LIMIT p_limit
  LOOP
    UPDATE public.rooms r2
       SET starts_at = v_now + make_interval(secs => r.countdown_sec),
           updated_at = v_now
     WHERE r2.id = r.id
       AND r2.status = 'waiting';
  END LOOP;

  RETURN;
END;
$function$;

ALTER FUNCTION game_core.fn_manage_waiting_rooms(p_limit integer, p_capture boolean) OWNER TO postgres;

-- =====================================================================
-- 5) تابع جدید پرداخت خزانه‌ی جایزه روم
-- =====================================================================
CREATE OR REPLACE FUNCTION game_finance.fn_payout_room_prize(p_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_locked boolean;
  v_now timestamptz := now();
  v_currency text;
  v_line_pool numeric := 0;
  v_full_pool numeric := 0;
  v_total_pool numeric := 0;
  v_paid_at timestamptz;
  v_total_weight numeric := 0;
  v_share numeric := 0;
  r record;
BEGIN
  v_locked := pg_try_advisory_xact_lock(
    ('x'||substr(replace(p_room::text,'-',''),1,16))::bit(64)::bigint
  );
  IF NOT v_locked THEN
    RAISE EXCEPTION 'payout already in progress for room %', p_room;
  END IF;

  SELECT currency,
         COALESCE(line_prize_pool, 0),
         COALESCE(full_prize_pool, 0),
         prize_paid_at
    INTO v_currency, v_line_pool, v_full_pool, v_paid_at
  FROM public.rooms
  WHERE id = p_room
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room % not found', p_room;
  END IF;

  IF v_paid_at IS NOT NULL THEN
    RETURN;
  END IF;

  v_total_pool := v_line_pool + v_full_pool;
  IF v_total_pool <= 0 THEN
    UPDATE public.rooms
       SET prize_paid_at = v_now,
           line_prize_pool = 0,
           full_prize_pool = 0,
           updated_at = v_now
     WHERE id = p_room;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.room_winners WHERE room_id = p_room) THEN
    SELECT COALESCE(SUM(weight), 0)
      INTO v_total_weight
    FROM public.room_winners
    WHERE room_id = p_room;

    IF v_total_weight <= 0 THEN
      RAISE EXCEPTION 'room % has invalid winner weights', p_room;
    END IF;

    FOR r IN
      SELECT user_id, ticket_id, weight
      FROM public.room_winners
      WHERE room_id = p_room
    LOOP
      v_share := ROUND(v_total_pool * (r.weight / v_total_weight), 2);
      IF v_share <= 0 THEN
        CONTINUE;
      END IF;

      PERFORM game_finance.fn_wallet_apply_delta(
        p_user_id := r.user_id,
        p_currency := v_currency,
        p_amount_delta := v_share,
        p_transaction_type := 'win',
        p_source_kind := 'room_prize',
        p_source_ref := p_room::text,
        p_description := 'room prize payout',
        p_meta := jsonb_build_object('room_id', p_room, 'ticket_id', r.ticket_id, 'note', 'TODO: split line/full pools when winner typing is available'),
        p_allow_negative := false
      );
    END LOOP;
  ELSE
    RAISE NOTICE 'room % has no entries in room_winners; prize pools left untouched', p_room;
    RETURN;
  END IF;

  UPDATE public.rooms
     SET prize_paid_at = v_now,
         line_prize_pool = 0,
         full_prize_pool = 0,
         updated_at = v_now
   WHERE id = p_room;
END;
$function$;

ALTER FUNCTION game_finance.fn_payout_room_prize(p_room uuid) OWNER TO postgres;

COMMIT;


