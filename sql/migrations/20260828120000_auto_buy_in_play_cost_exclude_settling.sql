-- In-play cost is only capital still at risk before the round outcome is known.
-- Settling rooms have a decided outcome; fund_remaining already reflects win/loss.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_auto_buy_in_play_cost(
  p_user_id uuid,
  p_template_id uuid,
  p_started_at timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(SUM(t.price), 0)::numeric(14, 2)
  FROM public.tickets t
  INNER JOIN public.rooms r ON r.id = t.room_id
  WHERE t.player_user_id = p_user_id
    AND r.room_template_id = p_template_id
    AND p_started_at IS NOT NULL
    AND t.created_at >= p_started_at
    AND r.status IN (
      'waiting'::public.room_status,
      'playing'::public.room_status
    )
    AND t.reservation_status IN (
      'reserved'::public.reservation_status,
      'confirmed'::public.reservation_status,
      'consumed'::public.reservation_status
    );
$$;

COMMIT;
