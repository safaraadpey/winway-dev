-- Batch ding credit for engine path: one round-trip for transactions + balances + lock.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_apply_ding_credits_for_draw(
  p_room_id uuid,
  p_draw_number integer,
  p_ding_per_card integer,
  p_credits jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_draw public.draws%ROWTYPE;
  v_now timestamptz := now();
  v_credited integer := 0;
BEGIN
  SELECT *
    INTO v_draw
  FROM public.draws
  WHERE room_id = p_room_id
    AND number = p_draw_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_draw.processed_at IS NULL OR v_draw.ding_aggregated_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(p_credits) = 'array' AND jsonb_array_length(p_credits) > 0 THEN
    WITH inc AS (
      SELECT
        (elem->>'user_id')::uuid AS user_id,
        (elem->>'amount')::numeric AS amount,
        COALESCE((elem->>'matched_cards')::integer, 0) AS matched_cards
      FROM jsonb_array_elements(p_credits) AS elem
      WHERE (elem->>'amount')::numeric > 0
    ),
    ins AS (
      INSERT INTO public.ding_transactions (
        user_id,
        room_id,
        ticket_id,
        draw_id,
        drawn_number,
        amount,
        description,
        created_at
      )
      SELECT
        i.user_id,
        p_room_id,
        NULL::uuid,
        v_draw.id,
        p_draw_number,
        i.amount,
        format(
          'Agg ding for draw %s number %s (%s cards x %s)',
          v_draw.id,
          p_draw_number,
          i.matched_cards,
          p_ding_per_card
        ),
        v_now
      FROM inc i
      ON CONFLICT DO NOTHING
      RETURNING user_id, amount
    )
    INSERT INTO public.ding_balances (user_id, balance, updated_at, created_at)
    SELECT
      user_id,
      sum(amount)::numeric,
      v_now,
      v_now
    FROM ins
    GROUP BY user_id
    ON CONFLICT (user_id) DO UPDATE
      SET balance = public.ding_balances.balance + excluded.balance,
          updated_at = v_now;

    SELECT count(DISTINCT user_id)::integer
      INTO v_credited
    FROM (
      SELECT (elem->>'user_id')::uuid AS user_id
      FROM jsonb_array_elements(p_credits) AS elem
      WHERE (elem->>'amount')::numeric > 0
    ) credited;
  END IF;

  UPDATE public.draws
     SET ding_aggregated_at = v_now
   WHERE id = v_draw.id
     AND ding_aggregated_at IS NULL;

  RETURN v_credited;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_apply_ding_credits_for_draw(
  uuid, integer, integer, jsonb
) TO service_role;

COMMIT;
