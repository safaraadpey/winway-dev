-- Migration: add paid_at to results and fix payout function
-- Date: 2025-12-02

BEGIN;

ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE OR REPLACE FUNCTION public.fn_payout_room_if_full(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_room record;
  v_winner record;
  v_currency text;
  v_line_reward numeric;
  v_full_reward numeric;
  v_reward_amount numeric;
  v_transaction_id uuid;
BEGIN
  SELECT currency, line_reward_percentage, full_reward_percentage, card_price
  INTO v_room
  FROM public.rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found: %', p_room_id;
  END IF;

  v_currency := v_room.currency;
  v_line_reward := v_room.card_price * (v_room.line_reward_percentage / 100.0);
  v_full_reward := v_room.card_price * (v_room.full_reward_percentage / 100.0);

  FOR v_winner IN
    SELECT user_id, win_type
    FROM public.results
    WHERE room_id = p_room_id
      AND win_type IN ('line', 'full')
      AND paid_at IS NULL
  LOOP
    IF v_winner.win_type = 'line' THEN
      v_reward_amount := v_line_reward;
    ELSIF v_winner.win_type = 'full' THEN
      v_reward_amount := v_full_reward;
    ELSE
      CONTINUE;
    END IF;

    SELECT game_finance.fn_wallet_apply_delta(
      p_user_id := v_winner.user_id,
      p_currency := v_currency,
      p_amount_delta := v_reward_amount,
      p_transaction_type := 'payout',
      p_source_kind := 'game_payout',
      p_source_ref := p_room_id::text,
      p_description := format('game payout: %s win', v_winner.win_type),
      p_meta := jsonb_build_object('room_id', p_room_id, 'win_type', v_winner.win_type),
      p_allow_negative := false
    ) INTO v_transaction_id;

    UPDATE public.results
    SET paid_at = now()
    WHERE room_id = p_room_id
      AND user_id = v_winner.user_id
      AND win_type = v_winner.win_type;
  END LOOP;
END;
$function$;

ALTER FUNCTION public.fn_payout_room_if_full(p_room_id uuid) OWNER TO postgres;

COMMIT;


