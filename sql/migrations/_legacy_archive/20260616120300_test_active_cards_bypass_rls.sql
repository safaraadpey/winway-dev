-- Temporary: bypass RLS via SECURITY DEFINER to compare with PostgREST .from("tickets").
BEGIN;

CREATE OR REPLACE FUNCTION public.test_active_cards_bypass_rls(p_room_id uuid)
RETURNS TABLE(user_id uuid, card_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.player_user_id, count(*)::bigint
  FROM public.tickets t
  WHERE t.room_id = p_room_id
    AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
  GROUP BY t.player_user_id;
$$;

ALTER FUNCTION public.test_active_cards_bypass_rls(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.test_active_cards_bypass_rls(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_active_cards_bypass_rls(uuid) TO service_role;

COMMIT;
