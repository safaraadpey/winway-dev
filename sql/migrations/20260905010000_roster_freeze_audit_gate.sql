-- Roster freeze (waiting-only ticket insert + join/promote locks),
-- shadow audit fail-closed columns, and proof-gate epoch reset.

BEGIN;

-- ---------------------------------------------------------------------------
-- A. Lock helpers + waiting-only ticket wall
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION game_core.fn_lock_room_if_waiting(p_room uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core
AS $$
DECLARE
  v_status public.room_status;
BEGIN
  IF p_room IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT r.status
    INTO v_status
  FROM public.rooms r
  WHERE r.id = p_room
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_status IS DISTINCT FROM 'waiting'::public.room_status THEN
    RETURN NULL;
  END IF;

  RETURN p_room;
END;
$$;

CREATE OR REPLACE FUNCTION game_core.fn_pick_and_lock_waiting_room(p_template_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core
AS $$
DECLARE
  v_id uuid;
  v_locked uuid;
BEGIN
  FOR i IN 1..8 LOOP
    SELECT r.id
      INTO v_id
    FROM public.rooms r
    WHERE r.status = 'waiting'::public.room_status
      AND r.room_template_id = p_template_id
    ORDER BY r.created_at ASC
    LIMIT 1;

    IF v_id IS NULL THEN
      RETURN NULL;
    END IF;

    v_locked := game_core.fn_lock_room_if_waiting(v_id);
    IF v_locked IS NOT NULL THEN
      RETURN v_locked;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION game_core.fn_tickets_waiting_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core
AS $$
DECLARE
  v_status public.room_status;
BEGIN
  SELECT r.status
    INTO v_status
  FROM public.rooms r
  WHERE r.id = NEW.room_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_insert_refused: room % not found', NEW.room_id;
  END IF;

  IF v_status IS DISTINCT FROM 'waiting'::public.room_status THEN
    RAISE EXCEPTION 'ticket_insert_refused: room not waiting';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_waiting_only ON public.tickets;
CREATE TRIGGER trg_tickets_waiting_only
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION game_core.fn_tickets_waiting_only();

-- Join: lock chosen waiting room (or-create retries via pick_and_lock).
DO $patch_join$
DECLARE
  v_src text;
  v_old text :=
    E'SELECT r.id, r.starts_at\n'
    || E'    INTO v_room, v_starts_at\n'
    || E'  FROM public.rooms r\n'
    || E'  WHERE r.status = ''waiting''::public.room_status\n'
    || E'    AND r.room_template_id = p_template_id\n'
    || E'  ORDER BY r.created_at ASC\n'
    || E'  LIMIT 1;';
  v_new text :=
    E'v_room := game_core.fn_pick_and_lock_waiting_room(p_template_id);\n'
    || E'  IF v_room IS NOT NULL THEN\n'
    || E'    SELECT r.starts_at INTO v_starts_at FROM public.rooms r WHERE r.id = v_room;\n'
    || E'  END IF;';
BEGIN
  SELECT pg_get_functiondef('game_core.fn_join_or_create_room_core(uuid,integer,text)'::regprocedure)
    INTO v_src;
  IF v_src IS NULL OR position(v_old in v_src) = 0 THEN
    RAISE EXCEPTION 'fn_join_or_create_room_core: waiting-room select not found for lock patch';
  END IF;
  IF position('fn_pick_and_lock_waiting_room' in v_src) = 0 THEN
    EXECUTE replace(v_src, v_old, v_new);
  END IF;

  SELECT pg_get_functiondef('game_core.fn_system_join_or_create_room(uuid,uuid,integer,text)'::regprocedure)
    INTO v_src;
  IF v_src IS NULL OR position(v_old in v_src) = 0 THEN
    RAISE EXCEPTION 'fn_system_join_or_create_room: waiting-room select not found for lock patch';
  END IF;
  IF position('fn_pick_and_lock_waiting_room' in v_src) = 0 THEN
    EXECUTE replace(v_src, v_old, v_new);
  END IF;
END;
$patch_join$;

CREATE OR REPLACE FUNCTION public.rpc_promote_waiting_room_to_playing(
  p_room uuid,
  p_next_draw_at timestamptz,
  p_now timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core
AS $$
BEGIN
  IF game_core.fn_lock_room_if_waiting(p_room) IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.rooms
     SET status = 'playing'::public.room_status,
         next_draw_at = p_next_draw_at,
         updated_at = COALESCE(p_now, now())
   WHERE id = p_room
     AND status = 'waiting'::public.room_status;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION game_core.fn_try_promote_room_at_max_capacity(p_room uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core
AS $$
DECLARE
  v_max_players integer;
  v_active_players integer;
  v_now timestamptz := now();
  v_jitter_ms integer;
  v_first_draw_delay_sec integer := 7;
BEGIN
  IF p_room IS NULL THEN
    RETURN false;
  END IF;

  IF game_core.fn_lock_room_if_waiting(p_room) IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(r.max_players, rt.max_players)
    INTO v_max_players
  FROM public.rooms r
  JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = p_room;

  IF v_max_players IS NULL THEN
    RETURN false;
  END IF;

  SELECT COUNT(DISTINCT t.player_user_id)
    INTO v_active_players
  FROM public.tickets t
  WHERE t.room_id = p_room
    AND t.reservation_status IN ('reserved', 'confirmed');

  IF COALESCE(v_active_players, 0) < v_max_players THEN
    RETURN false;
  END IF;

  v_jitter_ms := public.fn_draw_schedule_jitter_ms(p_room);

  UPDATE public.rooms r
     SET status = 'playing'::public.room_status,
         max_players = COALESCE(r.max_players, v_max_players),
         meta = COALESCE(r.meta, '{}'::jsonb) || jsonb_build_object('max_players', v_max_players),
         next_draw_at = v_now
                        + make_interval(secs => v_first_draw_delay_sec)
                        + (v_jitter_ms * interval '1 millisecond'),
         updated_at = v_now
   WHERE r.id = p_room
     AND r.status = 'waiting'::public.room_status;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION game_core.fn_manage_waiting_rooms(
  p_limit integer DEFAULT 50,
  p_capture boolean DEFAULT false
)
RETURNS TABLE(room_id uuid, became_live_at timestamp with time zone, paid_players integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core
AS $$
DECLARE
  r record;
  v_now timestamptz := now();
  v_active_players integer;
  v_draw_interval integer;
  v_first_draw_delay_sec integer := 7;
  v_jitter_ms integer;
BEGIN
  FOR r IN
    SELECT
      rm.id,
      COALESCE(rm.max_players, rt.max_players) AS max_players,
      COALESCE((rm.meta ->> 'draw_interval_sec')::int, 3) AS draw_interval_sec
    FROM public.rooms rm
    JOIN public.room_templates rt ON rt.id = rm.room_template_id
    WHERE rm.status = 'waiting'
      AND COALESCE(rm.max_players, rt.max_players) IS NOT NULL
      AND (
        SELECT COUNT(DISTINCT t.player_user_id)
        FROM public.tickets t
        WHERE t.room_id = rm.id
          AND t.reservation_status IN ('reserved','confirmed')
      ) >= COALESCE(rm.max_players, rt.max_players)
    ORDER BY rm.created_at ASC
    LIMIT p_limit
  LOOP
    IF game_core.fn_lock_room_if_waiting(r.id) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT COUNT(DISTINCT t.player_user_id)
      INTO v_active_players
      FROM public.tickets t
      WHERE t.room_id = r.id
        AND t.reservation_status IN ('reserved','confirmed');

    IF COALESCE(v_active_players, 0) < COALESCE(r.max_players, 0) THEN
      CONTINUE;
    END IF;

    v_draw_interval := GREATEST(COALESCE(r.draw_interval_sec, 3), 1);
    v_jitter_ms := public.fn_draw_schedule_jitter_ms(r.id);

    UPDATE public.rooms
       SET status       = 'playing',
           max_players  = COALESCE(max_players, r.max_players),
           meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('max_players', r.max_players),
           next_draw_at = v_now
                        + make_interval(secs => v_first_draw_delay_sec)
                        + (v_jitter_ms * interval '1 millisecond'),
           updated_at   = v_now
     WHERE id = r.id
       AND status = 'waiting';

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    room_id        := r.id;
    became_live_at := v_now;
    paid_players   := COALESCE(v_active_players, 0);
    RETURN NEXT;
  END LOOP;

  FOR r IN
    SELECT
      rm.id,
      rm.min_players,
      rm.starts_at,
      rm.next_draw_at,
      COALESCE((rm.meta ->> 'draw_interval_sec')::int, 3) AS draw_interval_sec
    FROM public.rooms rm
    WHERE rm.status = 'waiting'
      AND rm.starts_at IS NOT NULL
      AND v_now >= rm.starts_at
      AND (
        SELECT COUNT(DISTINCT t.player_user_id)
        FROM public.tickets t
        WHERE t.room_id = rm.id
          AND t.reservation_status IN ('reserved','confirmed')
      ) >= GREATEST(COALESCE(rm.min_players, 2), 2)
    ORDER BY rm.starts_at ASC
    LIMIT p_limit
  LOOP
    IF game_core.fn_lock_room_if_waiting(r.id) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT COUNT(DISTINCT t.player_user_id)
      INTO v_active_players
      FROM public.tickets t
      WHERE t.room_id = r.id
        AND t.reservation_status IN ('reserved','confirmed');

    IF COALESCE(v_active_players, 0) < GREATEST(COALESCE(r.min_players, 2), 2) THEN
      CONTINUE;
    END IF;

    v_draw_interval := GREATEST(COALESCE(r.draw_interval_sec, 3), 1);
    v_jitter_ms := public.fn_draw_schedule_jitter_ms(r.id);

    UPDATE public.rooms
       SET status       = 'playing',
           next_draw_at = v_now
                        + make_interval(secs => v_first_draw_delay_sec)
                        + (v_jitter_ms * interval '1 millisecond'),
           updated_at   = v_now
     WHERE id = r.id
       AND status = 'waiting';

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    room_id        := r.id;
    became_live_at := v_now;
    paid_players   := COALESCE(v_active_players, 0);
    RETURN NEXT;
  END LOOP;

  FOR r IN
    SELECT
      rm.id,
      rm.countdown_sec
    FROM public.rooms rm
    WHERE rm.status = 'waiting'
      AND rm.starts_at IS NOT NULL
      AND v_now >= rm.starts_at
      AND (
        SELECT COUNT(DISTINCT t.player_user_id)
        FROM public.tickets t
        WHERE t.room_id = rm.id
          AND t.reservation_status IN ('reserved','confirmed')
      ) < GREATEST(COALESCE(rm.min_players, 2), 2)
    ORDER BY rm.starts_at ASC
    LIMIT p_limit
  LOOP
    IF game_core.fn_lock_room_if_waiting(r.id) IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.rooms r2
       SET starts_at = v_now + make_interval(secs => COALESCE(r.countdown_sec, 120)),
           updated_at = v_now
     WHERE r2.id = r.id
       AND r2.status = 'waiting';
  END LOOP;

  IF p_capture THEN
    RAISE NOTICE 'wallet capture is disabled during Stage 1';
  END IF;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.load_test_seed_playing_rooms(
  p_room_count integer DEFAULT 20,
  p_tickets_per_room integer DEFAULT 200,
  p_draw_interval_sec integer DEFAULT 3,
  p_tag text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO load_test, public, game_core, pg_temp
AS $$
DECLARE
  v_tag            text := coalesce(nullif(trim(p_tag), ''), 'loadtest-' || to_char(now(), 'YYYYMMDDHH24MISS'));
  v_template       public.room_templates%ROWTYPE;
  v_pool           uuid;
  v_user_ids       uuid[];
  v_user_count     int;
  v_available      int;
  v_room_id        uuid;
  v_ticket_id      uuid;
  v_seed           bytea;
  v_seed_hash      char(64);
  v_now            timestamptz := now();
  v_room_ids       uuid[] := '{}';
  v_i              int;
  v_u              int;
  v_price          numeric;
  r_card           record;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL THEN
    IF coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' THEN
      RAISE EXCEPTION 'load_test_seed_playing_rooms: service_role only';
    END IF;
  END IF;

  IF p_room_count < 1 OR p_tickets_per_room < 1 THEN
    RAISE EXCEPTION 'invalid room_count or tickets_per_room';
  END IF;

  SELECT * INTO v_template FROM public.room_templates WHERE status = 'active'::public.room_template_status ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'no active room template'; END IF;

  SELECT id INTO v_pool FROM public.card_pools WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
  IF v_pool IS NULL THEN RAISE EXCEPTION 'no active card pool'; END IF;

  SELECT count(*)::int INTO v_available FROM public.card_pool_cards cpc WHERE cpc.pool_id = v_pool AND (v_template.room_type = 'tournament'::public.room_type OR cpc.card_no <= 200);
  IF v_available < p_tickets_per_room THEN
    RAISE EXCEPTION 'insufficient pool cards per room: need %, available % (room_type=%)', p_tickets_per_room, v_available, v_template.room_type;
  END IF;

  SELECT array_agg(sub.id ORDER BY sub.ord) INTO v_user_ids FROM (SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS ord FROM public.users u LIMIT greatest(p_tickets_per_room, 20)) sub;
  v_user_count := coalesce(array_length(v_user_ids, 1), 0);
  IF v_user_count = 0 THEN RAISE EXCEPTION 'no users found for ticket assignment'; END IF;

  v_price := COALESCE(v_template.price, 0);

  FOR v_i IN 1..p_room_count LOOP
    SELECT seed, seed_hash INTO v_seed, v_seed_hash FROM game_core.fn_generate_room_seed();
    v_room_id := gen_random_uuid();
    INSERT INTO public.rooms (
      id, room_template_id, status, card_price, price, currency, pool_id,
      min_players, max_cards_per_player, countdown_sec, starts_at, next_draw_at,
      room_seed, room_seed_hash, created_by, meta, created_at, updated_at, ding_settle_mode
    )
    VALUES (
      v_room_id, v_template.id, 'waiting'::public.room_status, v_template.price, v_template.price,
      v_template.currency, v_pool, 1, greatest(v_template.max_cards_per_player, p_tickets_per_room),
      coalesce(v_template.countdown_sec, 120), v_now - interval '5 minutes',
      v_now - make_interval(secs => p_draw_interval_sec), v_seed, v_seed_hash,
      v_user_ids[1 + ((v_i - 1) % v_user_count)],
      jsonb_build_object('load_test', true, 'load_test_tag', v_tag, 'draw_interval_sec', p_draw_interval_sec, 'source', 'load_test_seed'),
      v_now, v_now, game_core.fn_resolve_ding_settle_mode_for_new_room()
    );

    PERFORM game_core.fn_lock_room_if_waiting(v_room_id);

    v_u := 0;
    FOR r_card IN SELECT pool_card_id, card_no FROM load_test._pool_cards_for_room(v_pool, v_room_id, v_seed, v_template.room_type, p_tickets_per_room) LOOP
      v_u := v_u + 1;
      v_ticket_id := gen_random_uuid();
      INSERT INTO public.tickets (id, room_id, player_user_id, pool_card_id, card_no, reservation_status, price, created_at, updated_at)
      VALUES (v_ticket_id, v_room_id, v_user_ids[1 + ((v_u - 1) % v_user_count)], r_card.pool_card_id, r_card.card_no, 'reserved'::public.reservation_status, v_price, v_now, v_now);

      INSERT INTO public.commissions_log (
        ticket_id, room_id, player_id,
        gross_amount, commission_rate, commission_base,
        agent_rate, super_rate, agent_amount, super_amount, admin_amount,
        amount_to_pool, status, source, notes
      ) VALUES (
        v_ticket_id, v_room_id, v_user_ids[1 + ((v_u - 1) % v_user_count)],
        v_price, 0, 0,
        0, 0, 0, 0, 0,
        v_price, 'pending', 'load_test_seed',
        jsonb_build_object('load_test', true)
      );
    END LOOP;

    IF v_u < p_tickets_per_room THEN
      RAISE EXCEPTION 'room % only received % tickets (expected %)', v_room_id, v_u, p_tickets_per_room;
    END IF;

    UPDATE public.rooms
       SET status = 'playing'::public.room_status,
           updated_at = v_now
     WHERE id = v_room_id
       AND status = 'waiting'::public.room_status;

    UPDATE public.tickets
       SET reservation_status = 'consumed'::public.reservation_status,
           updated_at = v_now
     WHERE room_id = v_room_id;

    v_room_ids := array_append(v_room_ids, v_room_id);
  END LOOP;

  RETURN jsonb_build_object(
    'tag', v_tag,
    'room_ids', to_jsonb(v_room_ids),
    'room_count', p_room_count,
    'tickets_per_room', p_tickets_per_room,
    'draw_interval_sec', p_draw_interval_sec,
    'pool_id', v_pool,
    'template_id', v_template.id,
    'cards_per_room_capacity', v_available
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- C. Audit columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.game_replay_audits
  ADD COLUMN IF NOT EXISTS roster_mismatch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draw_count_mismatch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS post_manifest_ticket_count integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- D. Gate epoch (do not delete historical audits)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.game_replay_proof_epochs (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL
);

ALTER TABLE public.game_replay_proof_epochs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_replay_proof_epochs FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.game_replay_proof_epochs TO service_role, postgres;
GRANT USAGE, SELECT ON SEQUENCE public.game_replay_proof_epochs_id_seq TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.rpc_reset_shadow_replay_gate(p_reason text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'rpc_reset_shadow_replay_gate: reason required';
  END IF;

  INSERT INTO public.game_replay_proof_epochs (reason)
  VALUES (trim(p_reason))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE VIEW public.game_replay_proof_gate AS
SELECT
  COUNT(*) FILTER (WHERE a.outcome = 'MATCH') AS match_count,
  COUNT(*) FILTER (WHERE a.outcome = 'MISMATCH') AS mismatch_count,
  COUNT(*) FILTER (WHERE a.outcome = 'ERROR') AS error_count,
  COUNT(DISTINCT a.room_id) FILTER (WHERE a.outcome = 'MATCH') AS match_rooms,
  MIN(a.created_at) FILTER (WHERE a.outcome IN ('MATCH', 'MISMATCH')) AS first_compared_at,
  MAX(a.created_at) FILTER (WHERE a.outcome IN ('MATCH', 'MISMATCH')) AS last_compared_at,
  2000 AS gate_min_rooms,
  14 AS gate_min_days,
  (SELECT e.id FROM public.game_replay_proof_epochs e ORDER BY e.started_at DESC, e.id DESC LIMIT 1) AS epoch_id,
  (SELECT e.started_at FROM public.game_replay_proof_epochs e ORDER BY e.started_at DESC, e.id DESC LIMIT 1) AS epoch_started_at
FROM public.game_replay_audits a
WHERE a.created_at >= COALESCE(
  (SELECT e.started_at FROM public.game_replay_proof_epochs e ORDER BY e.started_at DESC, e.id DESC LIMIT 1),
  '-infinity'::timestamptz
);

REVOKE ALL ON FUNCTION game_core.fn_lock_room_if_waiting(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_core.fn_pick_and_lock_waiting_room(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_core.fn_tickets_waiting_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_promote_waiting_room_to_playing(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_reset_shadow_replay_gate(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION game_core.fn_lock_room_if_waiting(uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION game_core.fn_pick_and_lock_waiting_room(uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_promote_waiting_room_to_playing(uuid, timestamptz, timestamptz) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_reset_shadow_replay_gate(text) TO service_role, postgres;

COMMIT;
