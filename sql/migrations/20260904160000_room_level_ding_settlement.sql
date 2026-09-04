-- Room-level Ding settlement: atomic finish txn, room-boundary cutover, skip per-draw apply.
BEGIN;

-- ---------------------------------------------------------------------------
-- Schema: rooms.ding_settle_mode + settlement markers
-- ---------------------------------------------------------------------------

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS ding_settle_mode text NOT NULL DEFAULT 'per_draw',
  ADD COLUMN IF NOT EXISTS ding_settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS ding_settlement_key text,
  ADD COLUMN IF NOT EXISTS ding_settlement_version integer;

ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS rooms_ding_settle_mode_check;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_ding_settle_mode_check
  CHECK (ding_settle_mode IN ('per_draw', 'room_level'));

COMMENT ON COLUMN public.rooms.ding_settle_mode IS
  'per_draw = legacy per-draw Ding; room_level = Engine payload at fn_finish_room_and_settle.';

-- Runtime flag: when true, new waiting rooms stamp room_level at INSERT.
ALTER TABLE public.app_runtime_flags
  ADD COLUMN IF NOT EXISTS ding_room_settle_enabled boolean NOT NULL DEFAULT false;

-- Allow drawn_number = 0 sentinel for room-level settlement txs.
ALTER TABLE public.ding_transactions
  DROP CONSTRAINT IF EXISTS ding_transactions_drawn_number_check;

ALTER TABLE public.ding_transactions
  ADD CONSTRAINT ding_transactions_drawn_number_check
  CHECK (
    (drawn_number >= 1 AND drawn_number <= 90)
    OR drawn_number = 0
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_ding_tx_room_level_user
  ON public.ding_transactions (room_id, user_id)
  WHERE draw_id IS NULL AND ticket_id IS NULL AND drawn_number = 0;

-- ---------------------------------------------------------------------------
-- Stamp ding_settle_mode on room create (fn_join_or_create_room_core)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION game_core.fn_resolve_ding_settle_mode_for_new_room()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT CASE
    WHEN COALESCE(
      (SELECT arf.ding_room_settle_enabled FROM public.app_runtime_flags arf WHERE arf.id = true),
      false
    ) THEN 'room_level'
    ELSE 'per_draw'
  END;
$$;

-- Re-create join_or_create from latest baseline pattern with ding_settle_mode on INSERT.
-- Minimal patch: run ALTER won't work on function body — replace INSERT block only.

DO $patch$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef('game_core.fn_join_or_create_room_core(uuid,integer,text)'::regprocedure)
    INTO v_src;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'game_core.fn_join_or_create_room_core not found';
  END IF;

  IF v_src NOT LIKE '%ding_settle_mode%' THEN
    v_src := replace(
      v_src,
      E'        waiting_started_at,\n        created_at, updated_at',
      E'        waiting_started_at,\n        ding_settle_mode,\n        created_at, updated_at'
    );
    v_src := replace(
      v_src,
      E'        v_now,\n        v_now, v_now',
      E'        v_now,\n        game_core.fn_resolve_ding_settle_mode_for_new_room(),\n        v_now, v_now'
    );
    EXECUTE v_src;
  END IF;
END;
$patch$;

-- Tournament / system room inserts: stamp via same helper where rooms are created.
DO $patch2$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef('public.rpc_create_tournament_room(uuid,uuid,integer)'::regprocedure)
    INTO v_src;
  IF v_src IS NOT NULL AND v_src NOT LIKE '%ding_settle_mode%' THEN
    v_src := replace(v_src, 'created_at, updated_at)', 'created_at, updated_at, ding_settle_mode)');
    v_src := replace(
      v_src,
      'now(), now())',
      E'now(), now(), game_core.fn_resolve_ding_settle_mode_for_new_room())'
    );
    EXECUTE v_src;
  END IF;
EXCEPTION WHEN undefined_function THEN
  NULL;
END;
$patch2$;

-- ---------------------------------------------------------------------------
-- Apply room-level Ding credits inside finish txn
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION game_finance.fn_apply_room_level_ding_credits(
  p_room uuid,
  p_settlement_key text,
  p_settlement_version integer,
  p_credits jsonb,
  p_ding_per_card integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, tournament, game_finance, pg_temp
AS $function$
DECLARE
  v_now timestamptz := now();
  v_credited integer := 0;
BEGIN
  IF jsonb_typeof(p_credits) IS DISTINCT FROM 'array' OR jsonb_array_length(p_credits) = 0 THEN
    RETURN 0;
  END IF;

  WITH inc AS (
    SELECT
      (elem->>'user_id')::uuid AS user_id,
      (elem->>'amount')::numeric AS amount
    FROM jsonb_array_elements(p_credits) AS elem
    WHERE (elem->>'amount')::numeric > 0
  ),
  ins AS (
    INSERT INTO public.ding_transactions (
      user_id,
      room_id,
      ticket_id,
      draw_id,
      drawn_number,
      amount,
      description,
      created_at
    )
    SELECT
      i.user_id,
      p_room,
      NULL::uuid,
      NULL::uuid,
      0,
      i.amount,
      format(
        'Room ding settlement %s (v%s, %s per card)',
        p_settlement_key,
        COALESCE(p_settlement_version, 1),
        GREATEST(COALESCE(p_ding_per_card, 1), 0)
      ),
      v_now
    FROM inc i
    ON CONFLICT DO NOTHING
    RETURNING user_id, amount
  ),
  upsert_bal AS (
    INSERT INTO public.ding_balances (user_id, balance, updated_at, created_at)
    SELECT user_id, sum(amount)::numeric, v_now, v_now
    FROM ins
    GROUP BY user_id
    ON CONFLICT (user_id) DO UPDATE
      SET balance = public.ding_balances.balance + excluded.balance,
          updated_at = v_now
  ),
  tourn AS (
    SELECT tournament.fn_accumulate_player_ding(
      p_room,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'amount', amount)) FROM ins),
        '[]'::jsonb
      )
    )
  )
  SELECT count(DISTINCT ins.user_id)::integer
    INTO v_credited
  FROM ins
  CROSS JOIN tourn;

  RETURN v_credited;
END;
$function$;

REVOKE ALL ON FUNCTION game_finance.fn_apply_room_level_ding_credits(uuid, text, integer, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION game_finance.fn_apply_room_level_ding_credits(uuid, text, integer, jsonb, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Extend fn_finish_room_and_settle (additive signature)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION game_finance.fn_finish_room_and_settle(
  p_room uuid,
  p_admin_user uuid DEFAULT NULL,
  p_ding_settlement_key text DEFAULT NULL,
  p_ding_settlement_version integer DEFAULT NULL,
  p_ding_credits jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_finance, tournament, pg_temp
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
  v_room_level boolean;
  v_ding_per_card integer;
BEGIN
  SELECT r.*,
         COALESCE(r.line_reward_percentage, rt.line_reward_percentage, 0.5) AS __line_pct,
         COALESCE(r.full_reward_percentage, rt.full_reward_percentage, 0.5) AS __full_pct,
         COALESCE(r.ding_per_number, rt.ding_per_number, 1)::integer AS __ding_per_card
    INTO v_room
  FROM public.rooms r
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = p_room
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room % not found', p_room;
  END IF;

  v_room_level := v_room.ding_settle_mode = 'room_level';
  v_ding_per_card := GREATEST(COALESCE(v_room.__ding_per_card, 1), 0);

  IF v_room.status = 'finished' THEN
    RAISE NOTICE 'fn_finish_room_and_settle: room % already finished', p_room;
    RETURN;
  END IF;

  IF v_room.ding_settled_at IS NOT NULL
     AND p_ding_settlement_key IS NOT NULL
     AND v_room.ding_settlement_key IS NOT DISTINCT FROM p_ding_settlement_key THEN
    RAISE NOTICE 'fn_finish_room_and_settle: room % ding already settled (key=%)', p_room, p_ding_settlement_key;
    RETURN;
  END IF;

  IF v_room.status <> 'settling' THEN
    RAISE EXCEPTION 'room % is not settling (status=%)', p_room, v_room.status;
  END IF;

  IF v_room_level AND p_ding_credits IS NULL THEN
    RAISE EXCEPTION 'room % requires Engine Ding payload (room_level)', p_room;
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

  -- per_draw legacy path: consume tickets before prize (unchanged ordering)
  IF NOT v_room_level THEN
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
  END IF;

  FOR rec_comm IN
    SELECT ticket_id
      FROM public.commissions_log
     WHERE room_id = p_room
       AND status = 'pending'
     FOR UPDATE
  LOOP
    v_total_pool := v_total_pool + COALESCE(game_finance.fn_distribute_ticket_commission(rec_comm.ticket_id, p_admin_user), 0);
  END LOOP;

  v_line_pool := ROUND(v_total_pool * v_line_pct, 2);
  v_full_pool := ROUND(v_total_pool - v_line_pool, 2);

  SELECT COUNT(*) INTO v_line_winners
  FROM public.results
  WHERE room_id = p_room AND win_type = 'line' AND paid_at IS NULL;

  SELECT COUNT(*) INTO v_full_winners
  FROM public.results
  WHERE room_id = p_room AND win_type = 'full' AND paid_at IS NULL;

  IF v_line_winners = 0 THEN
    v_full_pool := v_full_pool + v_line_pool;
    v_line_pool := 0;
  END IF;

  IF v_line_winners > 0 THEN
    v_line_share := CASE WHEN v_line_pool > 0 THEN ROUND(v_line_pool / v_line_winners, 2) ELSE 0 END;
    FOR rec_result IN
      SELECT id, user_id, ticket_id
      FROM public.results
      WHERE room_id = p_room AND win_type = 'line' AND paid_at IS NULL
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
      WHERE room_id = p_room AND win_type = 'full' AND paid_at IS NULL
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

  -- room_level: Ding ledger in same txn, before ticket consume
  IF v_room_level THEN
    PERFORM game_finance.fn_apply_room_level_ding_credits(
      p_room,
      p_ding_settlement_key,
      COALESCE(p_ding_settlement_version, 1),
      COALESCE(p_ding_credits, '[]'::jsonb),
      v_ding_per_card
    );

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
  END IF;

  UPDATE public.rooms
     SET status = 'finished',
         prize_paid_at = v_now,
         ding_settled_at = CASE WHEN v_room_level THEN v_now ELSE ding_settled_at END,
         ding_settlement_key = CASE
           WHEN v_room_level THEN COALESCE(p_ding_settlement_key, ding_settlement_key)
           ELSE ding_settlement_key
         END,
         ding_settlement_version = CASE
           WHEN v_room_level THEN COALESCE(p_ding_settlement_version, ding_settlement_version)
           ELSE ding_settlement_version
         END,
         line_prize_pool = 0,
         full_prize_pool = 0,
         ends_at = COALESCE(ends_at, v_now),
         updated_at = v_now
   WHERE id = p_room;

  RAISE NOTICE 'room % settled: total_pool=%, line_winners=%, full_winners=%, room_level=%',
    p_room, v_total_pool, v_line_winners, v_full_winners, v_room_level;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_finish_room_and_settle(
  p_room uuid,
  p_admin_user uuid DEFAULT NULL,
  p_ding_settlement_key text DEFAULT NULL,
  p_ding_settlement_version integer DEFAULT NULL,
  p_ding_credits jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public, game_finance
AS $$
  SELECT game_finance.fn_finish_room_and_settle(
    p_room,
    p_admin_user,
    p_ding_settlement_key,
    p_ding_settlement_version,
    p_ding_credits
  );
$$;

REVOKE ALL ON FUNCTION public.fn_finish_room_and_settle(uuid, uuid, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_finish_room_and_settle(uuid, uuid, text, integer, jsonb) TO service_role;

REVOKE ALL ON FUNCTION game_finance.fn_finish_room_and_settle(uuid, uuid, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION game_finance.fn_finish_room_and_settle(uuid, uuid, text, integer, jsonb) TO service_role;

-- Drop old 2-arg overload grants remain on old signature — keep backward compat wrapper:
-- PostgREST resolves by arg count; engine passes new optional args.

-- ---------------------------------------------------------------------------
-- rpc_finalize_engine_draw_job: skip per-draw Ding for room_level rooms
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_finalize_engine_draw_job(
  p_job_id bigint,
  p_room_id uuid,
  p_draw_number integer,
  p_marks jsonb DEFAULT '[]'::jsonb,
  p_results jsonb DEFAULT '[]'::jsonb,
  p_set_first_line_draw_number boolean DEFAULT false,
  p_ding_per_card integer DEFAULT 0,
  p_credits jsonb DEFAULT '[]'::jsonb,
  p_queue_wait_ms integer DEFAULT NULL,
  p_processing_ms integer DEFAULT NULL,
  p_drain_started_at timestamptz DEFAULT NULL,
  p_first_picked_at timestamptz DEFAULT NULL,
  p_handler_started_at timestamptz DEFAULT NULL,
  p_actor_evaluate_started_at timestamptz DEFAULT NULL,
  p_actor_finalize_started_at timestamptz DEFAULT NULL,
  p_owner_id text DEFAULT NULL,
  p_lease_epoch bigint DEFAULT NULL,
  p_defer_ding boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_rpc_start timestamptz := clock_timestamp();
  v_finalize_ms integer;
  v_credited integer := 0;
  v_room public.rooms%ROWTYPE;
  v_live_actor_owned boolean;
  v_draw_id uuid;
  v_processed_now boolean := false;
  v_skip_ding boolean;
BEGIN
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  v_skip_ding := COALESCE(v_room.ding_settle_mode, 'per_draw') = 'room_level';

  v_live_actor_owned :=
    v_room.status = 'playing'::public.room_status
    AND v_room.engine_owner_id IS NOT NULL
    AND v_room.engine_lease_until IS NOT NULL
    AND v_room.engine_lease_until > clock_timestamp();

  IF v_live_actor_owned THEN
    IF p_owner_id IS NULL
       OR p_lease_epoch IS NULL
       OR v_room.engine_owner_id IS DISTINCT FROM p_owner_id
       OR v_room.engine_lease_epoch IS DISTINCT FROM p_lease_epoch THEN
      RETURN -1;
    END IF;
  END IF;

  IF jsonb_typeof(p_marks) = 'array' AND jsonb_array_length(p_marks) > 0 THEN
    INSERT INTO marks (ticket_id, value, created_at)
    SELECT (elem->>'ticket_id')::uuid, (elem->>'value')::integer, v_now
    FROM jsonb_array_elements(p_marks) AS elem
    ON CONFLICT (ticket_id, value) DO NOTHING;
  END IF;

  IF jsonb_typeof(p_results) = 'array' AND jsonb_array_length(p_results) > 0 THEN
    INSERT INTO results (room_id, user_id, ticket_id, win_type, draw_number, reward_amount)
    SELECT p_room_id, (elem->>'user_id')::uuid, (elem->>'ticket_id')::uuid,
           elem->>'win_type', p_draw_number, 0
    FROM jsonb_array_elements(p_results) AS elem
    ON CONFLICT (ticket_id, win_type) DO NOTHING;
  END IF;

  IF p_set_first_line_draw_number THEN
    UPDATE rooms SET first_line_draw_number = p_draw_number, updated_at = v_now
    WHERE id = p_room_id AND first_line_draw_number IS NULL;
  END IF;

  UPDATE draw_jobs SET status = 'done', updated_at = v_now WHERE id = p_job_id;

  v_finalize_ms := GREATEST(0, ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_rpc_start)) * 1000)::integer);

  PERFORM 1 FROM draw_jobs
  WHERE room_id = p_room_id AND draw_number = p_draw_number AND status <> 'done'
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE draws
    SET processed_at = v_now,
        queue_wait_ms = p_queue_wait_ms,
        processing_ms = p_processing_ms,
        finalize_ms = v_finalize_ms,
        drain_started_at = p_drain_started_at,
        first_picked_at = p_first_picked_at,
        handler_started_at = p_handler_started_at,
        actor_evaluate_started_at = COALESCE(p_actor_evaluate_started_at, actor_evaluate_started_at),
        actor_finalize_started_at = COALESCE(p_actor_finalize_started_at, actor_finalize_started_at)
    WHERE room_id = p_room_id AND number = p_draw_number AND processed_at IS NULL
    RETURNING id INTO v_draw_id;

    v_processed_now := FOUND;

    IF NOT v_processed_now THEN
      SELECT id INTO v_draw_id FROM draws WHERE room_id = p_room_id AND number = p_draw_number;
    END IF;
  END IF;

  IF v_skip_ding THEN
    IF v_processed_now AND v_draw_id IS NOT NULL THEN
      UPDATE public.draws
         SET ding_aggregated_at = v_now
       WHERE id = v_draw_id
         AND ding_aggregated_at IS NULL;
    END IF;
    RETURN 0;
  END IF;

  IF p_defer_ding AND v_processed_now AND v_draw_id IS NOT NULL THEN
    INSERT INTO public.ding_apply_jobs (
      draw_id, room_id, draw_number, ding_per_card, credits, status, created_at, updated_at
    )
    VALUES (
      v_draw_id, p_room_id, p_draw_number,
      GREATEST(COALESCE(p_ding_per_card, 0), 0),
      COALESCE(p_credits, '[]'::jsonb),
      'queued', v_now, v_now
    )
    ON CONFLICT (room_id, draw_number) DO NOTHING;
    RETURN 0;
  END IF;

  IF NOT p_defer_ding THEN
    v_credited := public.rpc_apply_ding_credits_for_draw(
      p_room_id, p_draw_number, p_ding_per_card, p_credits
    );
  END IF;

  RETURN v_credited;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_finalize_engine_draw_job(
  bigint, uuid, integer, jsonb, jsonb, boolean, integer, jsonb,
  integer, integer, timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, text, bigint, boolean
) TO service_role;

-- ---------------------------------------------------------------------------
-- Janitor: skip room_level (Engine must supply Ding payload)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION game_core.fn_janitor_repair_unsettled_finished(p_limit integer DEFAULT 20)
RETURNS TABLE(room_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_room record;
  v_last_draw integer;
  v_had_full_before integer;
  v_had_full_after integer;
  v_repaired integer := 0;
BEGIN
  FOR v_room IN
    SELECT r.id
    FROM public.rooms r
    WHERE r.status IN ('finished'::public.room_status, 'settling'::public.room_status)
      AND r.prize_paid_at IS NULL
      AND COALESCE(r.ding_settle_mode, 'per_draw') <> 'room_level'
      AND (SELECT count(*) FROM public.draws d WHERE d.room_id = r.id) >= 89
    ORDER BY r.updated_at ASC
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE OF r SKIP LOCKED
  LOOP
    BEGIN
      SELECT d.number INTO v_last_draw
      FROM public.draws d
      WHERE d.room_id = v_room.id
      ORDER BY d.created_at DESC
      LIMIT 1;

      IF v_last_draw IS NULL THEN CONTINUE; END IF;

      IF EXISTS (
        SELECT 1 FROM public.draw_jobs j
        WHERE j.room_id = v_room.id AND j.status IN ('queued', 'processing')
        LIMIT 1
      ) THEN CONTINUE; END IF;

      SELECT count(*) INTO v_had_full_before
      FROM public.results res WHERE res.room_id = v_room.id AND res.win_type = 'full';

      PERFORM public.fn_evaluate_room_after_draw(v_room.id, v_last_draw);

      SELECT count(*) INTO v_had_full_after
      FROM public.results res WHERE res.room_id = v_room.id AND res.win_type = 'full';

      IF v_had_full_after > v_had_full_before OR v_had_full_after > 0 THEN
        UPDATE public.rooms
        SET status = 'settling'::public.room_status, updated_at = now()
        WHERE id = v_room.id
          AND status IN ('finished'::public.room_status, 'settling'::public.room_status);

        PERFORM game_finance.fn_finish_room_and_settle(v_room.id);
      END IF;

      room_id := v_room.id;
      v_repaired := v_repaired + 1;
      RETURN NEXT;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'janitor_repair_unsettled_finished: room % failed: %', v_room.id, SQLERRM;
    END;
  END LOOP;

  IF v_repaired > 0 THEN
    RAISE LOG 'janitor_repair_unsettled_finished: repaired % room(s)', v_repaired;
  END IF;
END;
$function$;

COMMIT;

-- Phase 5 (explicit later): keep ding_apply_jobs, p_defer_ding, rpc_apply_ding_credits_for_draw
-- for per_draw rollback until drain window closes. Do not drop until ops sign-off.
