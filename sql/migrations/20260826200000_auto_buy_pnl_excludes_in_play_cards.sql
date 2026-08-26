-- Auto-buy P&L display: money sitting in unfinished tickets is capital, not a loss.
-- in_play_cost = sum(ticket.price) for this session's user+template in live rooms,
-- only for tickets created at/after session start (skip-first-join cards excluded).

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
      'playing'::public.room_status,
      'settling'::public.room_status
    )
    AND t.reservation_status IN (
      'reserved'::public.reservation_status,
      'confirmed'::public.reservation_status,
      'consumed'::public.reservation_status
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_player_auto_buy_snapshot(
  p_user_id uuid,
  p_template_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_session public.player_auto_buy_sessions%ROWTYPE;
  v_in_play_cost numeric := 0;
BEGIN
  SELECT * INTO v_session
  FROM public.player_auto_buy_sessions s
  WHERE s.user_id = p_user_id
    AND (p_template_id IS NULL OR s.template_id = p_template_id)
  ORDER BY
    CASE WHEN s.status = 'running'::public.player_auto_buy_status THEN 0 ELSE 1 END,
    s.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('active', false);
  END IF;

  IF v_session.status = 'running'::public.player_auto_buy_status THEN
    v_in_play_cost := public.fn_auto_buy_in_play_cost(
      v_session.user_id,
      v_session.template_id,
      v_session.started_at
    );
  END IF;

  RETURN jsonb_build_object(
    'active', v_session.status = 'running'::public.player_auto_buy_status,
    'session_id', v_session.id,
    'template_id', v_session.template_id,
    'status', v_session.status,
    'card_count', v_session.card_count,
    'fund_initial', v_session.fund_initial,
    'fund_remaining', v_session.fund_remaining,
    'in_play_cost', v_in_play_cost,
    'profit_target', v_session.profit_target,
    'last_room_id', v_session.last_room_id,
    'serial_buy_enabled', v_session.serial_buy_enabled,
    'anchor_room_id', v_session.anchor_room_id,
    'serial_next_room_id', v_session.serial_next_room_id,
    'stop_reason', v_session.stop_reason,
    'started_at', v_session.started_at,
    'stopped_at', v_session.stopped_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_auto_buy_in_play_cost(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_auto_buy_in_play_cost(uuid, uuid, timestamptz) TO postgres, service_role;

COMMIT;
