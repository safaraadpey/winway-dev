BEGIN;

-- Stage 7: cleanup + monitoring (no destructive drops)

-- 1) Monitoring views
CREATE SCHEMA IF NOT EXISTS monitor;

CREATE OR REPLACE VIEW monitor.rooms_settling_lag AS
SELECT
  r.id AS room_id,
  r.status,
  r.updated_at,
  EXTRACT(EPOCH FROM (now() - r.updated_at))::bigint AS lag_seconds,
  r.line_prize_pool,
  r.full_prize_pool
FROM public.rooms r
WHERE r.status = 'settling'::public.room_status;

CREATE OR REPLACE FUNCTION monitor.fn_rooms_settling_lag()
RETURNS TABLE(
  room_id uuid,
  status public.room_status,
  updated_at timestamptz,
  lag_seconds bigint,
  line_prize_pool numeric,
  full_prize_pool numeric
)
LANGUAGE sql
AS $$
  SELECT * FROM monitor.rooms_settling_lag;
$$;

CREATE OR REPLACE VIEW monitor.wallet_hold_consistency AS
SELECT
  r.id AS room_id,
  r.status,
  SUM(t.price) FILTER (
    WHERE t.reservation_status IN ('reserved','confirmed')
  ) AS reserved_value,
  (
    SELECT COALESCE(SUM(w.locked_amount), 0)
    FROM public.wallets w
    WHERE w.currency = r.currency
      AND w.user_id IN (
        SELECT DISTINCT t2.player_user_id
        FROM public.tickets t2
        WHERE t2.room_id = r.id
          AND t2.reservation_status IN ('reserved','confirmed')
      )
  ) AS locked_snapshot,
  COUNT(*) FILTER (
    WHERE t.reservation_status IN ('reserved','confirmed')
  ) AS pending_tickets
FROM public.rooms r
LEFT JOIN public.tickets t ON t.room_id = r.id
GROUP BY r.id, r.status;

-- 2) Deprecation wrappers
CREATE OR REPLACE FUNCTION game_finance.fn_wallet_capture_and_distribute(
  p_room uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated: use game_finance.fn_finish_room_and_settle instead';
END;
$$;

CREATE OR REPLACE FUNCTION game_finance.fn_consume_room_tickets(
  p_room uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated: tickets are consumed inside fn_finish_room_and_settle';
END;
$$;

-- 3) Logging hooks
CREATE OR REPLACE FUNCTION game_finance.fn_finish_room_and_settle(
  p_room uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room record;
  v_now timestamptz := now();
  rec_ticket record;
  rec_comm record;
  rec_result record;
  v_total_pool numeric := 0;
  v_line_pct numeric;
  v_full_pct numeric;
  v_line_pool numeric := 0;
  v_full_pool numeric := 0;
  v_line_winners integer := 0;
  v_full_winners integer := 0;
  v_line_share numeric := 0;
  v_full_share numeric := 0;
  v_currency text;
BEGIN
  SELECT r.*,
         COALESCE(r.line_reward_percentage, rt.line_reward_percentage, 0.5) AS __line_pct,
         COALESCE(r.full_reward_percentage, rt.full_reward_percentage, 0.5) AS __full_pct
    INTO v_room
  FROM public.rooms r
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = p_room
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room % not found', p_room;
  END IF;

  IF v_room.status = 'finished' THEN
    RAISE NOTICE 'fn_finish_room_and_settle: room % already finished', p_room;
    RETURN;
  END IF;

  IF v_room.status <> 'settling' THEN
    RAISE EXCEPTION 'room % is not settling (status=%)', p_room, v_room.status;
  END IF;

  v_currency := v_room.currency;
  v_line_pct := GREATEST(COALESCE(v_room.__line_pct, 0), 0);
  v_full_pct := GREATEST(COALESCE(v_room.__full_pct, 0), 0);

  IF v_line_pct = 0 AND v_full_pct = 0 THEN
    v_line_pct := 0.5;
    v_full_pct := 0.5;
  END IF;

  IF (v_line_pct + v_full_pct) > 1 THEN
    v_line_pct := v_line_pct / (v_line_pct + v_full_pct);
    v_full_pct := 1 - v_line_pct;
  END IF;

  FOR rec_ticket IN
    WITH updated AS (
      UPDATE public.tickets
         SET reservation_status = 'consumed'::public.reservation_status,
             updated_at = v_now
       WHERE room_id = p_room
         AND reservation_status IN ('reserved','confirmed')
       RETURNING id, player_user_id, price
    )
    SELECT * FROM updated
  LOOP
    PERFORM game_finance.fn_wallet_capture_join(
      rec_ticket.player_user_id,
      rec_ticket.price,
      v_currency,
      p_room,
      rec_ticket.id
    );
  END LOOP;

  FOR rec_comm IN
    SELECT ticket_id
      FROM public.commissions_log
     WHERE room_id = p_room
       AND status = 'pending'
     FOR UPDATE
  LOOP
    v_total_pool := v_total_pool + COALESCE(game_finance.fn_distribute_ticket_commission(rec_comm.ticket_id), 0);
  END LOOP;

  v_line_pool := ROUND(v_total_pool * v_line_pct, 2);
  v_full_pool := ROUND(v_total_pool - v_line_pool, 2);

  SELECT COUNT(*)
    INTO v_line_winners
  FROM public.results
  WHERE room_id = p_room
    AND win_type = 'line'
    AND paid_at IS NULL;

  SELECT COUNT(*)
    INTO v_full_winners
  FROM public.results
  WHERE room_id = p_room
    AND win_type = 'full'
    AND paid_at IS NULL;

  IF v_line_winners = 0 THEN
    v_full_pool := v_full_pool + v_line_pool;
    v_line_pool := 0;
  END IF;

  IF v_line_winners > 0 THEN
    v_line_share := CASE WHEN v_line_pool > 0 THEN ROUND(v_line_pool / v_line_winners, 2) ELSE 0 END;

    FOR rec_result IN
      SELECT id, user_id, ticket_id
      FROM public.results
      WHERE room_id = p_room
        AND win_type = 'line'
        AND paid_at IS NULL
      FOR UPDATE
    LOOP
      IF v_line_share > 0 THEN
        PERFORM game_finance.fn_wallet_apply_delta(
          p_user_id := rec_result.user_id,
          p_currency := v_currency,
          p_amount_delta := v_line_share,
          p_transaction_type := 'win',
          p_source_kind := 'room_settlement',
          p_source_ref := p_room::text,
          p_description := 'room line prize payout',
          p_meta := jsonb_build_object('room_id', p_room, 'ticket_id', rec_result.ticket_id, 'win_type', 'line'),
          p_allow_negative := false
        );
      END IF;

      UPDATE public.results
         SET reward_amount = COALESCE(reward_amount, 0) + v_line_share,
             paid_at = v_now
       WHERE id = rec_result.id;
    END LOOP;
  END IF;

  IF v_full_winners > 0 THEN
    v_full_share := CASE WHEN v_full_pool > 0 THEN ROUND(v_full_pool / v_full_winners, 2) ELSE 0 END;

    FOR rec_result IN
      SELECT id, user_id, ticket_id
      FROM public.results
      WHERE room_id = p_room
        AND win_type = 'full'
        AND paid_at IS NULL
      FOR UPDATE
    LOOP
      IF v_full_share > 0 THEN
        PERFORM game_finance.fn_wallet_apply_delta(
          p_user_id := rec_result.user_id,
          p_currency := v_currency,
          p_amount_delta := v_full_share,
          p_transaction_type := 'win',
          p_source_kind := 'room_settlement',
          p_source_ref := p_room::text,
          p_description := 'room full prize payout',
          p_meta := jsonb_build_object('room_id', p_room, 'ticket_id', rec_result.ticket_id, 'win_type', 'full'),
          p_allow_negative := false
        );
      END IF;

      UPDATE public.results
         SET reward_amount = COALESCE(reward_amount, 0) + v_full_share,
             paid_at = v_now
       WHERE id = rec_result.id;
    END LOOP;
  END IF;

  UPDATE public.rooms
     SET status = 'finished',
         prize_paid_at = v_now,
         line_prize_pool = 0,
         full_prize_pool = 0,
         ends_at = COALESCE(ends_at, v_now),
         updated_at = v_now
   WHERE id = p_room;

  RAISE NOTICE 'room % settled: total_pool=%, line_winners=%, full_winners=%',
    p_room, v_total_pool, v_line_winners, v_full_winners;
END;
$$;

ALTER FUNCTION game_finance.fn_finish_room_and_settle(uuid) OWNER TO postgres;


CREATE OR REPLACE FUNCTION game_core.fn_cancel_waiting_room_single(
  p_room uuid,
  p_actor uuid,
  p_reason text,
  p_require_single_player boolean,
  p_now timestamptz
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room record;
  v_ticket record;
  v_cancelled integer := 0;
  v_ticket_count integer := 0;
  c_cancelable constant public.reservation_status[] := ARRAY['held'::public.reservation_status,'reserved'::public.reservation_status,'confirmed'::public.reservation_status];
BEGIN
  IF p_room IS NULL THEN
    RAISE EXCEPTION 'room id is required';
  END IF;

  SELECT *
    INTO v_room
  FROM public.rooms
  WHERE id = p_room
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room % not found', p_room;
  END IF;

  IF v_room.status = 'cancelled'::public.room_status THEN
    RAISE NOTICE 'room % already cancelled; skipping', p_room;
    RETURN 0;
  END IF;

  IF v_room.status <> 'waiting'::public.room_status THEN
    RAISE EXCEPTION 'room % is not cancellable (status=%)', p_room, v_room.status;
  END IF;

  IF v_room.starts_at IS NOT NULL AND v_room.starts_at <= p_now THEN
    RAISE EXCEPTION 'room % is already live (starts_at passed)', p_room;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tickets
    WHERE room_id = p_room
      AND reservation_status = 'consumed'::public.reservation_status
  ) THEN
    RAISE EXCEPTION 'room % is already live (consumed tickets exist)', p_room;
  END IF;

  IF p_require_single_player THEN
    IF p_actor IS NULL THEN
      RAISE EXCEPTION 'unauthorized';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tickets
      WHERE room_id = p_room
        AND reservation_status = ANY(c_cancelable)
        AND player_user_id <> p_actor
    ) THEN
      RAISE EXCEPTION 'cannot cancel room %: other players have tickets', p_room;
    END IF;
  END IF;

  FOR v_ticket IN
    SELECT id
    FROM public.tickets
    WHERE room_id = p_room
      AND reservation_status = ANY(c_cancelable)
    FOR UPDATE
  LOOP
    PERFORM game_finance.fn_wallet_release_join(v_ticket.id);
    v_ticket_count := v_ticket_count + 1;
  END LOOP;

  UPDATE public.tickets
     SET reservation_status = 'cancelled'::public.reservation_status,
         cancelled_at = p_now,
         updated_at = p_now
   WHERE room_id = p_room
     AND reservation_status = ANY(c_cancelable);

  UPDATE public.rooms
     SET status = 'cancelled'::public.room_status,
         starts_at = NULL,
         ends_at = COALESCE(ends_at, p_now),
         cancelled_at = p_now,
         cancelled_by = p_actor,
         cancelled_reason = p_reason,
         updated_at = p_now
   WHERE id = p_room;

  RAISE NOTICE 'room % cancelled (% tickets) reason=% actor=%',
    p_room, v_ticket_count, p_reason, COALESCE(p_actor::text, 'anon');

  v_cancelled := 1;
  RETURN v_cancelled;
END;
$$;

ALTER FUNCTION game_core.fn_cancel_waiting_room_single(uuid, uuid, text, boolean, timestamptz) OWNER TO postgres;

COMMIT;
