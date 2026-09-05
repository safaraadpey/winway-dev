-- R8A: Stamp gameplay_persist_mode on ALL live room INSERT paths via
-- game_core.fn_resolve_gameplay_persist_mode_for_new_room().
-- Does not alter existing rooms, settlement, or legacy per_draw runtime.
BEGIN;

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

-- ---------------------------------------------------------------------------
-- game_core.fn_join_or_create_room_core (player join)
-- ---------------------------------------------------------------------------
DO $patch$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(
           'game_core.fn_join_or_create_room_core(uuid,integer,text)'::regprocedure
         )
    INTO v_src;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'game_core.fn_join_or_create_room_core not found';
  END IF;

  IF v_src NOT LIKE '%fn_resolve_gameplay_persist_mode_for_new_room%' THEN
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
-- game_core.fn_system_join_or_create_room (system / engine / dev-player)
-- ---------------------------------------------------------------------------
DO $patch$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(
           'game_core.fn_system_join_or_create_room(uuid,uuid,integer,text)'::regprocedure
         )
    INTO v_src;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'game_core.fn_system_join_or_create_room not found';
  END IF;

  IF v_src NOT LIKE '%fn_resolve_gameplay_persist_mode_for_new_room%' THEN
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
-- game_core.fn_auto_buy_get_or_create_serial_successor
-- ---------------------------------------------------------------------------
DO $patch$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(
           'game_core.fn_auto_buy_get_or_create_serial_successor(uuid)'::regprocedure
         )
    INTO v_src;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'game_core.fn_auto_buy_get_or_create_serial_successor not found';
  END IF;

  IF v_src NOT LIKE '%fn_resolve_gameplay_persist_mode_for_new_room%' THEN
    v_src := replace(
      v_src,
      E'    ding_settle_mode,\n    created_at, updated_at',
      E'    ding_settle_mode,\n    gameplay_persist_mode,\n    created_at, updated_at'
    );
    v_src := replace(
      v_src,
      E'    game_core.fn_resolve_ding_settle_mode_for_new_room(),\n    v_now,\n    v_now',
      E'    game_core.fn_resolve_ding_settle_mode_for_new_room(),\n    game_core.fn_resolve_gameplay_persist_mode_for_new_room(),\n    v_now,\n    v_now'
    );
    EXECUTE v_src;
  END IF;
END;
$patch$;

-- ---------------------------------------------------------------------------
-- tournament.fn_create_rooms_for_round
-- ---------------------------------------------------------------------------
DO $patch$
DECLARE
  v_src text;
  v_patched boolean := false;
BEGIN
  SELECT pg_get_functiondef(
           'tournament.fn_create_rooms_for_round(uuid,integer,uuid)'::regprocedure
         )
    INTO v_src;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'tournament.fn_create_rooms_for_round not found';
  END IF;

  IF v_src LIKE '%fn_resolve_gameplay_persist_mode_for_new_room%' THEN
    RETURN;
  END IF;

  -- CRLF body (production Supabase)
  IF position(E'ding_settle_mode\r\n    )\r\n    SELECT\r\n' in v_src) > 0 THEN
    v_src := replace(
      v_src,
      E'      updated_at,\r\n      ding_settle_mode\r\n    )\r\n    SELECT\r\n',
      E'      updated_at,\r\n      ding_settle_mode,\r\n      gameplay_persist_mode\r\n    )\r\n    SELECT\r\n'
    );
    v_src := replace(
      v_src,
      E'      v_now,\r\n      v_now,\r\n      game_core.fn_resolve_ding_settle_mode_for_new_room()\r\n    RETURNING id INTO v_game_room_id',
      E'      v_now,\r\n      v_now,\r\n      game_core.fn_resolve_ding_settle_mode_for_new_room(),\r\n      game_core.fn_resolve_gameplay_persist_mode_for_new_room()\r\n    RETURNING id INTO v_game_room_id'
    );
    v_patched := true;
  END IF;

  -- LF fallback
  IF NOT v_patched AND position(E'ding_settle_mode\n    )\n    SELECT\n' in v_src) > 0 THEN
    v_src := replace(
      v_src,
      E'      updated_at,\n      ding_settle_mode\n    )\n    SELECT\n',
      E'      updated_at,\n      ding_settle_mode,\n      gameplay_persist_mode\n    )\n    SELECT\n'
    );
    v_src := replace(
      v_src,
      E'      v_now,\n      v_now,\n      game_core.fn_resolve_ding_settle_mode_for_new_room()\n    RETURNING id INTO v_game_room_id',
      E'      v_now,\n      v_now,\n      game_core.fn_resolve_ding_settle_mode_for_new_room(),\n      game_core.fn_resolve_gameplay_persist_mode_for_new_room()\n    RETURNING id INTO v_game_room_id'
    );
    v_patched := true;
  END IF;

  IF NOT v_patched OR v_src NOT LIKE '%fn_resolve_gameplay_persist_mode_for_new_room%' THEN
    RAISE EXCEPTION 'tournament.fn_create_rooms_for_round: could not locate INSERT block for gameplay_persist_mode patch';
  END IF;

  EXECUTE v_src;
END;
$patch$;

-- ---------------------------------------------------------------------------
-- public.load_test_seed_playing_rooms (load-test; stamp for completeness)
-- ---------------------------------------------------------------------------
DO $patch$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(
           'public.load_test_seed_playing_rooms(integer,integer,integer,text)'::regprocedure
         )
    INTO v_src;

  IF v_src IS NOT NULL AND v_src NOT LIKE '%fn_resolve_gameplay_persist_mode_for_new_room%' THEN
    v_src := replace(
      v_src,
      E'      room_seed, room_seed_hash, created_by, meta, created_at, updated_at, ding_settle_mode\n    )',
      E'      room_seed, room_seed_hash, created_by, meta, created_at, updated_at, ding_settle_mode, gameplay_persist_mode\n    )'
    );
    v_src := replace(
      v_src,
      E'      v_now, v_now, game_core.fn_resolve_ding_settle_mode_for_new_room()\n    );',
      E'      v_now, v_now, game_core.fn_resolve_ding_settle_mode_for_new_room(), game_core.fn_resolve_gameplay_persist_mode_for_new_room()\n    );'
    );
    IF v_src NOT LIKE '%fn_resolve_gameplay_persist_mode_for_new_room%' THEN
      RAISE EXCEPTION 'public.load_test_seed_playing_rooms: gameplay_persist_mode patch failed';
    END IF;
    EXECUTE v_src;
  END IF;
EXCEPTION WHEN undefined_function THEN
  NULL;
END;
$patch$;

-- ---------------------------------------------------------------------------
-- Post-patch guard: every live room INSERT function must call resolver
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_fn text;
  v_src text;
  v_missing text[] := ARRAY[]::text[];
  v_live_inserts text[] := ARRAY[
    'game_core.fn_join_or_create_room_core(uuid,integer,text)',
    'game_core.fn_system_join_or_create_room(uuid,uuid,integer,text)',
    'game_core.fn_auto_buy_get_or_create_serial_successor(uuid)',
    'tournament.fn_create_rooms_for_round(uuid,integer,uuid)',
    'public.load_test_seed_playing_rooms(integer,integer,integer,text)'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_live_inserts
  LOOP
    BEGIN
      SELECT pg_get_functiondef(v_fn::regprocedure) INTO v_src;
    EXCEPTION WHEN undefined_function THEN
      CONTINUE;
    END;

    IF v_src IS NULL THEN
      CONTINUE;
    END IF;

    IF (
         v_src ILIKE '%INSERT INTO public.rooms%'
         OR v_src ILIKE '%INSERT INTO rooms%'
       )
       AND v_src NOT LIKE '%fn_resolve_gameplay_persist_mode_for_new_room%' THEN
      v_missing := array_append(v_missing, v_fn);
    END IF;
  END LOOP;

  IF coalesce(array_length(v_missing, 1), 0) > 0 THEN
    RAISE EXCEPTION 'R8A guard: unpatched room INSERT paths remain: %', v_missing;
  END IF;
END;
$guard$;

COMMIT;
