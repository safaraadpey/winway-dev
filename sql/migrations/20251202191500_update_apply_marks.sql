-- Migration: align rpc_apply_marks_for_draw with consumed tickets
-- Date: 2025-12-02

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_apply_marks_for_draw(p_room_id uuid, p_draw_number integer)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO marks (ticket_id, value, created_at)
  SELECT DISTINCT
    t.id,
    p_draw_number,
    now()
  FROM tickets t
  INNER JOIN card_numbers cn ON cn.pool_card_id = t.pool_card_id
  WHERE t.room_id = p_room_id
    AND t.reservation_status IN ('confirmed','consumed')
    AND cn.value = p_draw_number
    AND NOT EXISTS (
      SELECT 1
      FROM marks m
      WHERE m.ticket_id = t.id
        AND m.value = p_draw_number
    );
END;
$function$;

ALTER FUNCTION public.rpc_apply_marks_for_draw(p_room_id uuid, p_draw_number integer) OWNER TO postgres;

COMMIT;


