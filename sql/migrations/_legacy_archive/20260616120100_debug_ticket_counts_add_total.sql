-- Extend debug_ticket_counts: room breakdown + global tickets row count.
BEGIN;

DROP FUNCTION IF EXISTS public.debug_ticket_counts(uuid);

CREATE OR REPLACE FUNCTION public.debug_ticket_counts(p_room_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'room_counts',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'player_user_id', s.player_user_id,
            'cards', s.cards
          )
          ORDER BY s.player_user_id
        )
        FROM (
          SELECT t.player_user_id, count(*)::bigint AS cards
          FROM public.tickets t
          WHERE t.room_id = p_room_id
            AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
          GROUP BY t.player_user_id
        ) s
      ),
      '[]'::jsonb
    ),
    'total_tickets', (SELECT count(*)::bigint FROM public.tickets)
  );
$$;

ALTER FUNCTION public.debug_ticket_counts(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.debug_ticket_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_ticket_counts(uuid) TO service_role;

COMMIT;
