-- Migration: move fn_cancel_waiting_rooms into game_core
-- تاریخ: 2025-11-28

BEGIN;

CREATE OR REPLACE FUNCTION game_core.fn_cancel_waiting_rooms(
  p_room uuid,
  p_by_admin boolean DEFAULT false,
  p_user uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user            uuid := COALESCE(p_user, auth.uid());
  v_now             timestamptz := now();
  v_cancelled_rooms int := 0;
  r_room            RECORD;
  r_pay             RECORD;
  v_wallet_id       uuid;
  v_refund          numeric;
BEGIN
  IF p_by_admin IS FALSE THEN
    IF v_user IS NULL THEN
      RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT id, status, card_price, currency, starts_at
      INTO r_room
    FROM public.rooms
    WHERE id = p_room
    FOR UPDATE;

    IF r_room.id IS NULL THEN
      RAISE EXCEPTION 'room not found';
    END IF;

    IF r_room.status <> 'waiting'::room_status THEN
      RAISE EXCEPTION 'room is not in waiting status';
    END IF;

    IF r_room.starts_at IS NOT NULL AND r_room.starts_at <= v_now THEN
      RAISE EXCEPTION 'room already due to start';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.room_id = r_room.id
        AND t.reservation_status IN ('reserved')
        AND t.player_user_id <> v_user
    ) THEN
      RAISE EXCEPTION 'cannot cancel: other players present';
    END IF;

    FOR r_pay IN
      SELECT t.player_user_id AS uid, COUNT(*) AS cnt
      FROM public.tickets t
      WHERE t.room_id = r_room.id
        AND t.reservation_status = 'reserved'
      GROUP BY t.player_user_id
    LOOP
      IF r_pay.uid <> v_user THEN
        RAISE EXCEPTION 'cannot cancel: other players present';
      END IF;

      v_refund := r_room.card_price * r_pay.cnt;
      SELECT id INTO v_wallet_id FROM public.wallets
       WHERE user_id = r_pay.uid
       FOR UPDATE;

      IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'wallet not found for player %', r_pay.uid;
      END IF;

      INSERT INTO public.transactions(
        id, wallet_id, user_id, type, status, amount, currency,
        description, related_room, balance_before, balance_after, created_at
      )
      SELECT gen_random_uuid(), v_wallet_id, r_pay.uid, 'refund', 'completed',
             v_refund, r_room.currency,
             'self-cancel waiting room '||r_room.id, r_room.id,
             w.balance, w.balance + v_refund, v_now
        FROM public.wallets w
       WHERE w.id = v_wallet_id;

      UPDATE public.wallets
         SET locked_amount = GREATEST(locked_amount - v_refund, 0),
             balance       = balance + v_refund,
             updated_at    = v_now
       WHERE id = v_wallet_id;
    END LOOP;

    UPDATE public.tickets
       SET reservation_status = 'cancelled',
           updated_at = v_now
     WHERE room_id = r_room.id
       AND reservation_status = 'reserved';

    UPDATE public.rooms
       SET status = 'cancelled',
           starts_at = NULL,
           updated_at = v_now
     WHERE id = r_room.id;

    v_cancelled_rooms := v_cancelled_rooms + 1;
  ELSE
    FOR r_room IN
      SELECT id, card_price, currency
        FROM public.rooms
       WHERE status = 'waiting'::room_status
       FOR UPDATE SKIP LOCKED
    LOOP
      FOR r_pay IN
        SELECT t.player_user_id AS uid, COUNT(*) AS cnt
          FROM public.tickets t
         WHERE t.room_id = r_room.id
           AND t.reservation_status = 'reserved'
         GROUP BY t.player_user_id
      LOOP
        v_refund := r_room.card_price * r_pay.cnt;
        SELECT id INTO v_wallet_id FROM public.wallets
         WHERE user_id = r_pay.uid
         FOR UPDATE;

        IF v_wallet_id IS NULL THEN
          CONTINUE;
        END IF;

        INSERT INTO public.transactions(
          id, wallet_id, user_id, type, status, amount, currency,
          description, related_room, balance_before, balance_after, created_at
        )
        SELECT gen_random_uuid(), v_wallet_id, r_pay.uid, 'refund', 'completed',
               v_refund, r_room.currency,
               'admin-cancel waiting room '||r_room.id, r_room.id,
               w.balance, w.balance + v_refund, v_now
          FROM public.wallets w
         WHERE w.id = v_wallet_id;

        UPDATE public.wallets
           SET locked_amount = GREATEST(locked_amount - v_refund, 0),
               balance       = balance + v_refund,
               updated_at    = v_now
         WHERE id = v_wallet_id;
      END LOOP;

      UPDATE public.tickets
         SET reservation_status = 'cancelled',
             updated_at = v_now
       WHERE room_id = r_room.id
         AND reservation_status = 'reserved';

      UPDATE public.rooms
         SET status = 'cancelled',
             starts_at = NULL,
             updated_at = v_now
       WHERE id = r_room.id;

      v_cancelled_rooms := v_cancelled_rooms + 1;
    END LOOP;
  END IF;

  RETURN v_cancelled_rooms;
END;
$function$;

COMMIT;

