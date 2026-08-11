-- Migration: fix fn_consume_room_tickets CTE scope
-- Date: 2025-12-02

BEGIN;

CREATE OR REPLACE FUNCTION game_finance.fn_consume_room_tickets(p_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_now timestamptz := now();
  v_ticket_ids uuid[];
  v_ticket uuid;
BEGIN
  WITH locked_tickets AS (
    SELECT id
    FROM public.tickets
    WHERE room_id = p_room
      AND reservation_status IN ('reserved','confirmed')
    FOR UPDATE
  ),
  updated_tickets AS (
    UPDATE public.tickets t
       SET reservation_status = 'consumed'::reservation_status,
           updated_at = v_now
     WHERE t.id IN (SELECT id FROM locked_tickets)
     RETURNING t.id
  )
  SELECT array_agg(id) INTO v_ticket_ids
  FROM updated_tickets;

  IF v_ticket_ids IS NULL THEN
    RETURN;
  END IF;

  FOREACH v_ticket IN ARRAY v_ticket_ids LOOP
    PERFORM game_finance.fn_record_ticket_commission(v_ticket);
  END LOOP;
END;
$function$;

ALTER FUNCTION game_finance.fn_consume_room_tickets(p_room uuid) OWNER TO postgres;

COMMIT;


