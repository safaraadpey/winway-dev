BEGIN;

-- Stage 3: finalize rooms inside the database (lock at JOIN, settle at FINISH)

-- 1) Update commission distribution to use status flag and to return amount_to_pool
CREATE OR REPLACE FUNCTION game_finance.fn_distribute_ticket_commission(
  p_ticket uuid
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  c              public.commissions_log%ROWTYPE;
  v_currency     text;
  v_admin_user   uuid;
  v_rollup_amount numeric := 0;
  v_transaction_id uuid;
BEGIN
  SELECT *
    INTO c
  FROM public.commissions_log
  WHERE ticket_id = p_ticket
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM game_finance.fn_record_ticket_commission(p_ticket);
    SELECT *
      INTO c
    FROM public.commissions_log
    WHERE ticket_id = p_ticket
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'commission log not found for ticket %', p_ticket;
    END IF;
  END IF;

  IF c.status IS DISTINCT FROM 'pending' THEN
    RETURN 0;
  END IF;

  SELECT currency
    INTO v_currency
  FROM public.rooms
  WHERE id = c.room_id;

  SELECT id
    INTO v_admin_user
  FROM public.users
  WHERE role = 'admin'
  ORDER BY created_at
  LIMIT 1;

  IF c.agent_id IS NOT NULL AND c.agent_amount > 0 THEN
    BEGIN
      PERFORM game_finance.fn_wallet_apply_delta(
        p_user_id         := c.agent_id,
        p_currency        := v_currency,
        p_amount_delta    := c.agent_amount,
        p_transaction_type:= 'fee_agent',
        p_source_kind     := 'ticket_commission',
        p_source_ref      := NULL,
        p_description     := 'ticket commission (agent)',
        p_meta            := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
        p_allow_negative  := false
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_rollup_amount := v_rollup_amount + c.agent_amount;
    END;
  END IF;

  IF c.super_id IS NOT NULL AND c.super_amount > 0 THEN
    BEGIN
      PERFORM game_finance.fn_wallet_apply_delta(
        p_user_id         := c.super_id,
        p_currency        := v_currency,
        p_amount_delta    := c.super_amount,
        p_transaction_type:= 'fee_super',
        p_source_kind     := 'ticket_commission',
        p_source_ref      := NULL,
        p_description     := 'ticket commission (super)',
        p_meta            := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
        p_allow_negative  := false
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_rollup_amount := v_rollup_amount + c.super_amount;
    END;
  END IF;

  IF (c.admin_amount + v_rollup_amount) > 0 AND v_admin_user IS NOT NULL THEN
    PERFORM game_finance.fn_wallet_apply_delta(
      p_user_id         := v_admin_user,
      p_currency        := v_currency,
      p_amount_delta    := c.admin_amount + v_rollup_amount,
      p_transaction_type:= 'fee_admin',
      p_source_kind     := 'ticket_commission',
      p_source_ref      := NULL,
      p_description     := 'ticket commission (admin remainder)',
      p_meta            := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
      p_allow_negative  := false
    );
  END IF;

  UPDATE public.commissions_log
     SET distributed_at = now(),
         admin_amount   = c.admin_amount + v_rollup_amount,
         status         = 'settled'
   WHERE id = c.id;

  RETURN GREATEST(COALESCE(c.amount_to_pool, 0), 0);
END;
$function$;

ALTER FUNCTION game_finance.fn_distribute_ticket_commission(uuid) OWNER TO postgres;

-- Backfill historical records to respect the new status contract
UPDATE public.commissions_log
   SET status = 'settled'
 WHERE distributed_at IS NOT NULL
   AND status <> 'settled';


-- 2) Final settlement function (atomic, idempotent)
CREATE OR REPLACE FUNCTION game_finance.fn_finish_room_and_settle(
  p_room uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
    RETURN;
  END IF;

  IF v_room.status <> 'settling' THEN
    RAISE EXCEPTION 'room % is not settling (current status: %)', p_room, v_room.status;
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

  -- Consume tickets (idempotent thanks to UPDATE ... RETURNING)
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

  -- Settle commissions and accumulate prize pool
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
          p_user_id         := rec_result.user_id,
          p_currency        := v_currency,
          p_amount_delta    := v_line_share,
          p_transaction_type:= 'win',
          p_source_kind     := 'room_settlement',
          p_source_ref      := p_room::text,
          p_description     := 'room line prize payout',
          p_meta            := jsonb_build_object('room_id', p_room, 'ticket_id', rec_result.ticket_id, 'win_type', 'line'),
          p_allow_negative  := false
        );
      END IF;

      UPDATE public.results
         SET reward_amount = COALESCE(reward_amount, 0) + v_line_share,
             paid_at       = v_now
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
          p_user_id         := rec_result.user_id,
          p_currency        := v_currency,
          p_amount_delta    := v_full_share,
          p_transaction_type:= 'win',
          p_source_kind     := 'room_settlement',
          p_source_ref      := p_room::text,
          p_description     := 'room full prize payout',
          p_meta            := jsonb_build_object('room_id', p_room, 'ticket_id', rec_result.ticket_id, 'win_type', 'full'),
          p_allow_negative  := false
        );
      END IF;

      UPDATE public.results
         SET reward_amount = COALESCE(reward_amount, 0) + v_full_share,
             paid_at       = v_now
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
END;
$function$;

ALTER FUNCTION game_finance.fn_finish_room_and_settle(uuid) OWNER TO postgres;


-- 3) Draw engine now hands control over to the settlement function
CREATE OR REPLACE FUNCTION public.fn_evaluate_room_after_draw(
  p_room_id uuid,
  p_draw_number integer
) RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_full_winner_count integer;
BEGIN
  WITH ticket_analysis AS (
    SELECT 
      t.id AS ticket_id,
      t.player_user_id AS user_id,
      t.pool_card_id,
      COUNT(DISTINCT cn.value) AS total_cells,
      COUNT(DISTINCT CASE WHEN m.value IS NOT NULL THEN cn.value END) AS marked_cells,
      COUNT(DISTINCT CASE WHEN cn.row_no = 1 AND m.value IS NOT NULL THEN cn.value END) AS row1_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 2 AND m.value IS NOT NULL THEN cn.value END) AS row2_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 3 AND m.value IS NOT NULL THEN cn.value END) AS row3_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 1 THEN cn.value END) AS row1_total,
      COUNT(DISTINCT CASE WHEN cn.row_no = 2 THEN cn.value END) AS row2_total,
      COUNT(DISTINCT CASE WHEN cn.row_no = 3 THEN cn.value END) AS row3_total
    FROM tickets t
    INNER JOIN card_numbers cn ON cn.pool_card_id = t.pool_card_id
    LEFT JOIN marks m ON m.ticket_id = t.id AND m.value = cn.value
    WHERE t.room_id = p_room_id
      AND t.reservation_status = 'confirmed'
      AND NOT EXISTS (
        SELECT 1 
        FROM results r 
        WHERE r.ticket_id = t.id 
          AND r.draw_number = p_draw_number
      )
    GROUP BY t.id, t.player_user_id, t.pool_card_id
  ),
  winners AS (
    SELECT 
      ticket_id,
      user_id,
      CASE 
        WHEN marked_cells = total_cells THEN 'full'
        WHEN row1_marked = row1_total OR 
             row2_marked = row2_total OR 
             row3_marked = row3_total THEN 'line'
      END AS win_type
    FROM ticket_analysis
    WHERE (marked_cells = total_cells OR 
           row1_marked = row1_total OR 
           row2_marked = row2_total OR 
           row3_marked = row3_total)
  )
  INSERT INTO results (room_id, user_id, ticket_id, win_type, reward_amount, draw_number)
  SELECT 
    p_room_id,
    user_id,
    ticket_id,
    win_type,
    0,
    p_draw_number
  FROM winners
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*)
    INTO v_full_winner_count
  FROM results
  WHERE room_id = p_room_id
    AND win_type = 'full'
    AND draw_number = p_draw_number;

  IF v_full_winner_count > 0 THEN
    UPDATE rooms
       SET status = 'settling',
           updated_at = NOW()
     WHERE id = p_room_id
       AND status <> 'finished'::room_status
       AND status <> 'settling'::room_status;

    PERFORM game_finance.fn_finish_room_and_settle(p_room_id);
  END IF;
END;
$function$;

ALTER FUNCTION public.fn_evaluate_room_after_draw(uuid, integer) OWNER TO postgres;


-- 4) Deprecate legacy payout helpers by delegating to the settlement function
CREATE OR REPLACE FUNCTION public.fn_payout_room_if_full(p_room_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  PERFORM game_finance.fn_finish_room_and_settle(p_room_id);
END;
$function$;

ALTER FUNCTION public.fn_payout_room_if_full(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION game_finance.fn_payout_room_prize(p_room uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  PERFORM game_finance.fn_finish_room_and_settle(p_room);
END;
$function$;

ALTER FUNCTION game_finance.fn_payout_room_prize(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION game_finance.fn_payout_winners(p_room uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  PERFORM game_finance.fn_finish_room_and_settle(p_room);
END;
$function$;

ALTER FUNCTION game_finance.fn_payout_winners(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION game_core.fn_payout_room(p_room uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  PERFORM game_finance.fn_finish_room_and_settle(p_room);
END;
$function$;

ALTER FUNCTION game_core.fn_payout_room(uuid) OWNER TO postgres;

COMMIT;
