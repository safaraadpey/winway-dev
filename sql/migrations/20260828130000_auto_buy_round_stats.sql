-- Auto-buy session round stats for UI: wins, losses, total completed hands.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_auto_buy_round_stats(
  p_session_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  WITH rounds AS (
    SELECT rl.finished_room_id
    FROM public.player_auto_buy_round_locks rl
    WHERE rl.session_id = p_session_id
  ),
  scored AS (
    SELECT
      r.finished_room_id,
      EXISTS (
        SELECT 1
        FROM public.transactions t
        WHERE t.user_id = p_user_id
          AND t.room_id = r.finished_room_id
          AND t.type = 'win'::public.transaction_type
          AND t.status = 'completed'::public.transaction_status
          AND t.amount > 0
      ) AS won
    FROM rounds r
  )
  SELECT jsonb_build_object(
    'rounds_total', COALESCE(COUNT(*)::int, 0),
    'rounds_won', COALESCE(COUNT(*) FILTER (WHERE won)::int, 0),
    'rounds_lost', COALESCE(COUNT(*) FILTER (WHERE NOT won)::int, 0)
  )
  FROM scored;
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
  v_round_stats jsonb := jsonb_build_object(
    'rounds_total', 0,
    'rounds_won', 0,
    'rounds_lost', 0
  );
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
    v_round_stats := public.fn_auto_buy_round_stats(v_session.id, v_session.user_id);
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
    'rounds_total', COALESCE((v_round_stats->>'rounds_total')::int, 0),
    'rounds_won', COALESCE((v_round_stats->>'rounds_won')::int, 0),
    'rounds_lost', COALESCE((v_round_stats->>'rounds_lost')::int, 0),
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

REVOKE ALL ON FUNCTION public.fn_auto_buy_round_stats(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_auto_buy_round_stats(uuid, uuid) TO postgres, service_role;

COMMIT;
