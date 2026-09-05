-- Phase E: manifest_ram gameplay mode + atomic settlement from Engine finalization payload.
-- CANARY OFF by default — new rooms stay per_draw until app_runtime_flags enables manifest_ram.
BEGIN;

-- ---------------------------------------------------------------------------
-- Schema: rooms.gameplay_persist_mode + finalization markers
-- ---------------------------------------------------------------------------

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS gameplay_persist_mode text NOT NULL DEFAULT 'per_draw',
  ADD COLUMN IF NOT EXISTS finalization_sha256 character(64),
  ADD COLUMN IF NOT EXISTS finalization_contract_version integer;

ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS rooms_gameplay_persist_mode_check;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_gameplay_persist_mode_check
  CHECK (gameplay_persist_mode IN ('per_draw', 'manifest_ram'));

COMMENT ON COLUMN public.rooms.gameplay_persist_mode IS
  'Stamped once at room create. manifest_ram = RAM play + one-shot settlement; per_draw = legacy hot path.';

COMMENT ON COLUMN public.rooms.finalization_sha256 IS
  'Canonical sha256 of GameFinalizationResult payload — idempotent settlement guard.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_rooms_finalization_sha256
  ON public.rooms (finalization_sha256)
  WHERE finalization_sha256 IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Runtime flag (engine syncs; default false = CANARY OFF)
-- ---------------------------------------------------------------------------

ALTER TABLE public.app_runtime_flags
  ADD COLUMN IF NOT EXISTS gameplay_manifest_ram_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_runtime_flags.gameplay_manifest_ram_enabled IS
  'When true, new rooms stamp gameplay_persist_mode=manifest_ram via fn_resolve_gameplay_persist_mode_for_new_room().';

-- ---------------------------------------------------------------------------
-- Stamp gameplay_persist_mode on room create
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION game_core.fn_resolve_gameplay_persist_mode_for_new_room()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT CASE
    WHEN COALESCE(
      (SELECT arf.gameplay_manifest_ram_enabled FROM public.app_runtime_flags arf WHERE arf.id = true),
      false
    ) THEN 'manifest_ram'
    ELSE 'per_draw'
  END;
$$;

-- Patch room INSERT paths (same pattern as ding_settle_mode stamp).
DO $patch$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(
           'game_core.fn_system_join_or_create_room(uuid,uuid,integer,text)'::regprocedure
         )
    INTO v_src;

  IF v_src IS NOT NULL AND v_src NOT LIKE '%gameplay_persist_mode%' THEN
    v_src := replace(
      v_src,
      E'        ding_settle_mode,\n        created_at, updated_at',
      E'        ding_settle_mode,\n        gameplay_persist_mode,\n        created_at, updated_at'
    );
    v_src := replace(
      v_src,
      E'        game_core.fn_resolve_ding_settle_mode_for_new_room(),\n        v_now, v_now',
      E'        game_core.fn_resolve_ding_settle_mode_for_new_room(),\n        game_core.fn_resolve_gameplay_persist_mode_for_new_room(),\n        v_now, v_now'
    );
    EXECUTE v_src;
  END IF;
END;
$patch$;

-- ---------------------------------------------------------------------------
-- Atomic settlement from Engine GameFinalizationResult (manifest_ram only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION game_finance.fn_finish_room_from_finalization(
  p_room uuid,
  p_finalization jsonb,
  p_admin_user uuid DEFAULT NULL,
  p_persist_history boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_finance, tournament, pg_temp
AS $function$
DECLARE
  v_room record;
  v_now timestamptz := now();
  v_payload jsonb;
  v_result_sha256 text;
  v_contract_version integer;
  v_room_id uuid;
  rec_ticket record;
  rec_comm record;
  rec_result record;
  rec_winner record;
  rec_mark record;
  rec_draw integer;
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
  v_ding_per_card integer;
  v_ding_key text;
  v_ding_version integer;
  v_ding_credits jsonb;
  v_first_line integer;
  v_draw_seq jsonb;
  v_marks jsonb;
BEGIN
  IF p_finalization IS NULL OR jsonb_typeof(p_finalization) <> 'object' THEN
    RAISE EXCEPTION 'finalization payload required';
  END IF;

  v_result_sha256 := p_finalization->>'resultSha256';
  v_contract_version := COALESCE((p_finalization->>'contractVersion')::integer, 1);
  v_room_id := COALESCE((p_finalization->>'roomId')::uuid, p_room);
  v_payload := p_finalization->'payload';

  IF v_room_id IS DISTINCT FROM p_room THEN
    RAISE EXCEPTION 'finalization roomId mismatch';
  END IF;

  IF v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object' THEN
    RAISE EXCEPTION 'finalization.payload required';
  END IF;

  IF v_result_sha256 IS NULL OR length(v_result_sha256) <> 64 THEN
    RAISE EXCEPTION 'finalization.resultSha256 invalid';
  END IF;

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

  IF COALESCE(v_room.gameplay_persist_mode, 'per_draw') <> 'manifest_ram' THEN
    RAISE EXCEPTION 'room % is not manifest_ram (mode=%)', p_room, v_room.gameplay_persist_mode;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.game_manifests m WHERE m.room_id = p_room) THEN
    RAISE EXCEPTION 'room % has no game manifest', p_room;
  END IF;

  -- Idempotent: already finished with same hash
  IF v_room.status = 'finished'
     AND v_room.finalization_sha256 IS NOT DISTINCT FROM v_result_sha256 THEN
    RAISE NOTICE 'fn_finish_room_from_finalization: room % already finalized (hash=%)', p_room, v_result_sha256;
    RETURN;
  END IF;

  IF v_room.finalization_sha256 IS NOT NULL
     AND v_room.finalization_sha256 IS DISTINCT FROM v_result_sha256 THEN
    RAISE EXCEPTION 'room % checksum_mismatch (stored=% submitted=%)',
      p_room, v_room.finalization_sha256, v_result_sha256;
  END IF;

  IF v_room.status NOT IN ('playing', 'settling') THEN
    RAISE EXCEPTION 'room % cannot finalize from status=%', p_room, v_room.status;
  END IF;

  v_currency := v_room.currency;
  v_ding_per_card := GREATEST(COALESCE(v_room.__ding_per_card, 1), 0);
  v_ding_key := p_finalization->>'dingSettlementKey';
  v_ding_version := COALESCE((p_finalization->>'dingSettlementVersion')::integer, 1);
  v_ding_credits := COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('user_id', d->>'userId', 'amount', (d->>'amount')::numeric))
      FROM jsonb_array_elements(COALESCE(v_payload->'dingByUser', '[]'::jsonb)) AS d
    ),
    '[]'::jsonb
  );
  v_first_line := (v_payload->>'firstLineDrawNumber')::integer;
  v_draw_seq := COALESCE(v_payload->'drawSequence', '[]'::jsonb);
  v_marks := COALESCE(v_payload->'marks', '[]'::jsonb);

  -- Transition to settling if still playing
  IF v_room.status = 'playing' THEN
    UPDATE public.rooms
       SET status = 'settling',
           updated_at = v_now
     WHERE id = p_room;
  END IF;

  -- Authoritative results from payload (not from prior per-draw inserts)
  FOR rec_winner IN
    SELECT
      w->>'ticketId' AS ticket_id,
      w->>'userId' AS user_id,
      (w->>'drawNumber')::integer AS draw_number,
      'line'::text AS win_type
    FROM jsonb_array_elements(COALESCE(v_payload->'lineWinners', '[]'::jsonb)) AS w
    UNION ALL
    SELECT
      w->>'ticketId',
      w->>'userId',
      (w->>'drawNumber')::integer,
      'full'::text
    FROM jsonb_array_elements(COALESCE(v_payload->'fullWinners', '[]'::jsonb)) AS w
  LOOP
    INSERT INTO public.results (
      room_id, user_id, ticket_id, win_type, draw_number, reward_amount, created_at
    )
    VALUES (
      p_room,
      rec_winner.user_id::uuid,
      rec_winner.ticket_id::uuid,
      rec_winner.win_type,
      rec_winner.draw_number,
      0,
      v_now
    )
    ON CONFLICT (ticket_id, win_type) DO NOTHING;
  END LOOP;

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

  FOR rec_comm IN
    SELECT ticket_id
      FROM public.commissions_log
     WHERE room_id = p_room
       AND status = 'pending'
     FOR UPDATE
  LOOP
    v_total_pool := v_total_pool + COALESCE(
      game_finance.fn_distribute_ticket_commission(rec_comm.ticket_id, p_admin_user),
      0
    );
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
          p_description := 'room line prize payout (manifest_ram)',
          p_meta := jsonb_build_object(
            'room_id', p_room,
            'ticket_id', rec_result.ticket_id,
            'win_type', 'line',
            'finalization_sha256', v_result_sha256
          ),
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
          p_description := 'room full prize payout (manifest_ram)',
          p_meta := jsonb_build_object(
            'room_id', p_room,
            'ticket_id', rec_result.ticket_id,
            'win_type', 'full',
            'finalization_sha256', v_result_sha256
          ),
          p_allow_negative := false
        );
      END IF;
      UPDATE public.results
         SET reward_amount = COALESCE(reward_amount, 0) + v_full_share,
             paid_at = v_now
       WHERE id = rec_result.id;
    END LOOP;
  END IF;

  -- Room-level Ding + tournament ding (once from payload)
  IF COALESCE(v_room.ding_settle_mode, 'per_draw') = 'room_level' THEN
    PERFORM game_finance.fn_apply_room_level_ding_credits(
      p_room,
      v_ding_key,
      v_ding_version,
      v_ding_credits,
      v_ding_per_card
    );
  END IF;

  -- Consume tickets
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

  -- Optional bulk gameplay history (draws + marks) in same txn
  IF p_persist_history THEN
    FOR rec_draw IN
      SELECT (t.value)::integer
      FROM jsonb_array_elements_text(v_draw_seq) AS t(value)
    LOOP
      INSERT INTO public.draws (room_id, number, created_at, processed_at)
      VALUES (p_room, rec_draw, v_now, v_now)
      ON CONFLICT (room_id, number) DO NOTHING;
    END LOOP;

    FOR rec_mark IN
      SELECT
        m->>'ticketId' AS ticket_id,
        (m->>'value')::integer AS value
      FROM jsonb_array_elements(v_marks) AS m
    LOOP
      INSERT INTO public.marks (ticket_id, value, created_at)
      VALUES (rec_mark.ticket_id::uuid, rec_mark.value, v_now)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  UPDATE public.rooms
     SET status = 'finished',
         prize_paid_at = v_now,
         ding_settled_at = CASE
           WHEN COALESCE(ding_settle_mode, 'per_draw') = 'room_level' THEN v_now
           ELSE ding_settled_at
         END,
         ding_settlement_key = CASE
           WHEN COALESCE(ding_settle_mode, 'per_draw') = 'room_level' THEN COALESCE(v_ding_key, ding_settlement_key)
           ELSE ding_settlement_key
         END,
         ding_settlement_version = CASE
           WHEN COALESCE(ding_settle_mode, 'per_draw') = 'room_level' THEN COALESCE(v_ding_version, ding_settlement_version)
           ELSE ding_settlement_version
         END,
         first_line_draw_number = COALESCE(v_first_line, first_line_draw_number),
         finalization_sha256 = v_result_sha256,
         finalization_contract_version = v_contract_version,
         line_prize_pool = 0,
         full_prize_pool = 0,
         ends_at = COALESCE(ends_at, v_now),
         updated_at = v_now
   WHERE id = p_room;

  RAISE NOTICE 'room % finalized manifest_ram: hash=%, line_winners=%, full_winners=%',
    p_room, v_result_sha256, v_line_winners, v_full_winners;
END;
$function$;

REVOKE ALL ON FUNCTION game_finance.fn_finish_room_from_finalization(uuid, jsonb, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION game_finance.fn_finish_room_from_finalization(uuid, jsonb, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_finish_room_from_finalization(
  p_room uuid,
  p_finalization jsonb,
  p_admin_user uuid DEFAULT NULL,
  p_persist_history boolean DEFAULT true
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public, game_finance
AS $$
  SELECT game_finance.fn_finish_room_from_finalization(
    p_room,
    p_finalization,
    p_admin_user,
    p_persist_history
  );
$$;

REVOKE ALL ON FUNCTION public.fn_finish_room_from_finalization(uuid, jsonb, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_finish_room_from_finalization(uuid, jsonb, uuid, boolean) TO service_role;

COMMIT;
