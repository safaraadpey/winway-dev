-- Fix ambiguous room_id in rpc_backfill_missed_engine_ding (RETURNS TABLE column vs UPDATE).

DROP FUNCTION IF EXISTS public.rpc_backfill_missed_engine_ding(uuid);

CREATE OR REPLACE FUNCTION public.rpc_backfill_missed_engine_ding(
  p_room_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_room_id uuid,
  draw_number integer,
  users_credited integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_draw record;
  v_ding_per_card integer;
  v_credits jsonb;
  v_credited integer;
BEGIN
  FOR v_draw IN
    SELECT
      d.room_id,
      d.number AS draw_number,
      COALESCE(r.ding_per_number, rt.ding_per_number, 1)::integer AS ding_per_card
    FROM public.draws d
    JOIN public.rooms r ON r.id = d.room_id
    LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE d.processed_at IS NOT NULL
      AND d.ding_aggregated_at IS NULL
      AND (p_room_id IS NULL OR d.room_id = p_room_id)
    ORDER BY d.processed_at
  LOOP
    v_ding_per_card := GREATEST(v_draw.ding_per_card, 0);

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', per_user.user_id,
          'amount', per_user.matched_cards * v_ding_per_card,
          'matched_cards', per_user.matched_cards
        )
      ),
      '[]'::jsonb
    )
      INTO v_credits
    FROM (
      SELECT
        t.player_user_id AS user_id,
        count(*)::integer AS matched_cards
      FROM public.marks m
      JOIN public.tickets t ON t.id = m.ticket_id
      WHERE t.room_id = v_draw.room_id
        AND t.cancelled_at IS NULL
        AND m.value = v_draw.draw_number
      GROUP BY t.player_user_id
      HAVING count(*) > 0
    ) per_user;

    IF jsonb_array_length(v_credits) = 0 THEN
      UPDATE public.draws d
         SET ding_aggregated_at = now()
       WHERE d.room_id = v_draw.room_id
         AND d.number = v_draw.draw_number
         AND d.ding_aggregated_at IS NULL;
      v_credited := 0;
    ELSE
      v_credited := public.rpc_apply_ding_credits_for_draw(
        v_draw.room_id,
        v_draw.draw_number,
        v_ding_per_card,
        v_credits
      );
    END IF;

    out_room_id := v_draw.room_id;
    draw_number := v_draw.draw_number;
    users_credited := v_credited;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_backfill_missed_engine_ding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_backfill_missed_engine_ding(uuid) TO service_role;
