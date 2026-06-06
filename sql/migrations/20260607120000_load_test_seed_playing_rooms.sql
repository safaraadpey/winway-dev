-- Load-test helpers: seed N playing rooms with M tickets each (service_role only).
-- Card uniqueness is per room (same as fn_system_join), not global across rooms.
-- Used by game-engine/scripts/load-test-draw.ts

BEGIN;

CREATE SCHEMA IF NOT EXISTS load_test;

CREATE OR REPLACE FUNCTION load_test._pool_cards_for_room(
  p_pool_id    uuid,
  p_room_id    uuid,
  p_room_seed  bytea,
  p_room_type  public.room_type,
  p_limit      int
)
RETURNS TABLE(pool_card_id bigint, card_no integer)
LANGUAGE sql
STABLE
AS $$
  SELECT c.id, c.card_no
  FROM public.card_pool_cards c
  WHERE c.pool_id = p_pool_id
    AND (
      p_room_type = 'tournament'::public.room_type
      OR c.card_no <= 200
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.pool_card_id = c.id
        AND t.room_id = p_room_id
        AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
    )
  ORDER BY digest(encode(p_room_seed, 'hex') || ':' || c.id::text, 'sha256')
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.load_test_seed_playing_rooms(
  p_room_count        int  DEFAULT 20,
  p_tickets_per_room  int  DEFAULT 200,
  p_draw_interval_sec int  DEFAULT 3,
  p_tag               text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = load_test, public, game_core, pg_temp
AS $$
DECLARE
  v_tag            text := coalesce(nullif(trim(p_tag), ''), 'loadtest-' || to_char(now(), 'YYYYMMDDHH24MISS'));
  v_template       public.room_templates%ROWTYPE;
  v_pool           uuid;
  v_user_ids       uuid[];
  v_user_count     int;
  v_available      int;
  v_room_id        uuid;
  v_seed           bytea;
  v_seed_hash      char(64);
  v_now            timestamptz := now();
  v_room_ids       uuid[] := '{}';
  v_i              int;
  v_u              int;
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

  SELECT * INTO v_template
  FROM public.room_templates
  WHERE status = 'active'::public.room_template_status
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active room template';
  END IF;

  SELECT id INTO v_pool
  FROM public.card_pools
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_pool IS NULL THEN
    RAISE EXCEPTION 'no active card pool';
  END IF;

  SELECT count(*)::int INTO v_available
  FROM public.card_pool_cards cpc
  WHERE cpc.pool_id = v_pool
    AND (
      v_template.room_type = 'tournament'::public.room_type
      OR cpc.card_no <= 200
    );

  IF v_available < p_tickets_per_room THEN
    RAISE EXCEPTION
      'insufficient pool cards per room: need %, available % (room_type=%)',
      p_tickets_per_room, v_available, v_template.room_type;
  END IF;

  SELECT array_agg(sub.id ORDER BY sub.ord)
    INTO v_user_ids
  FROM (
    SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS ord
    FROM public.users u
    LIMIT greatest(p_tickets_per_room, 20)
  ) sub;

  v_user_count := coalesce(array_length(v_user_ids, 1), 0);
  IF v_user_count = 0 THEN
    RAISE EXCEPTION 'no users found for ticket assignment';
  END IF;

  FOR v_i IN 1..p_room_count LOOP
    SELECT seed, seed_hash INTO v_seed, v_seed_hash
    FROM game_core.fn_generate_room_seed();

    v_room_id := gen_random_uuid();

    INSERT INTO public.rooms (
      id,
      room_template_id,
      status,
      card_price,
      price,
      currency,
      pool_id,
      min_players,
      max_cards_per_player,
      countdown_sec,
      starts_at,
      next_draw_at,
      room_seed,
      room_seed_hash,
      created_by,
      meta,
      created_at,
      updated_at
    ) VALUES (
      v_room_id,
      v_template.id,
      'playing'::public.room_status,
      v_template.price,
      v_template.price,
      v_template.currency,
      v_pool,
      1,
      greatest(v_template.max_cards_per_player, p_tickets_per_room),
      coalesce(v_template.countdown_sec, 120),
      v_now - interval '5 minutes',
      v_now - make_interval(secs => p_draw_interval_sec),
      v_seed,
      v_seed_hash,
      v_user_ids[1 + ((v_i - 1) % v_user_count)],
      jsonb_build_object(
        'load_test', true,
        'load_test_tag', v_tag,
        'draw_interval_sec', p_draw_interval_sec,
        'source', 'load_test_seed'
      ),
      v_now,
      v_now
    );

    v_u := 0;
    FOR r_card IN
      SELECT pool_card_id, card_no
      FROM load_test._pool_cards_for_room(
        v_pool, v_room_id, v_seed, v_template.room_type, p_tickets_per_room
      )
    LOOP
      v_u := v_u + 1;
      INSERT INTO public.tickets (
        id,
        room_id,
        player_user_id,
        pool_card_id,
        card_no,
        reservation_status,
        price,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        v_room_id,
        v_user_ids[1 + ((v_u - 1) % v_user_count)],
        r_card.pool_card_id,
        r_card.card_no,
        'consumed'::public.reservation_status,
        v_template.price,
        v_now,
        v_now
      );
    END LOOP;

    IF v_u < p_tickets_per_room THEN
      RAISE EXCEPTION 'room % only received % tickets (expected %)', v_room_id, v_u, p_tickets_per_room;
    END IF;

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

CREATE OR REPLACE FUNCTION public.load_test_cleanup(p_tag text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_room_ids uuid[];
  v_deleted_rooms int;
BEGIN
  SELECT array_agg(id) INTO v_room_ids
  FROM public.rooms
  WHERE (meta->>'load_test')::boolean IS TRUE
    AND (p_tag IS NULL OR meta->>'load_test_tag' = p_tag);

  IF v_room_ids IS NULL OR array_length(v_room_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted_rooms', 0);
  END IF;

  DELETE FROM public.draw_jobs WHERE room_id = ANY(v_room_ids);
  DELETE FROM public.marks m
  USING public.tickets t
  WHERE m.ticket_id = t.id AND t.room_id = ANY(v_room_ids);
  DELETE FROM public.results WHERE room_id = ANY(v_room_ids);
  DELETE FROM public.draws WHERE room_id = ANY(v_room_ids);
  DELETE FROM public.tickets WHERE room_id = ANY(v_room_ids);
  DELETE FROM public.rooms WHERE id = ANY(v_room_ids);

  GET DIAGNOSTICS v_deleted_rooms = ROW_COUNT;
  RETURN jsonb_build_object('deleted_rooms', v_deleted_rooms, 'tag', p_tag);
END;
$$;

REVOKE ALL ON FUNCTION public.load_test_seed_playing_rooms(int, int, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.load_test_cleanup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_test_seed_playing_rooms(int, int, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.load_test_cleanup(text) TO service_role;

COMMIT;
