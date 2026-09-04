-- Stamp ding_settle_mode on ALL room INSERT paths via fn_resolve_ding_settle_mode_for_new_room().
-- Does not alter existing rooms or settlement logic.
BEGIN;

-- Ensure resolver exists (idempotent; created in 20260904160000).
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

-- ---------------------------------------------------------------------------
-- game_core.fn_system_join_or_create_room (engine / dev-player path)
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

  IF v_src NOT LIKE '%ding_settle_mode%' THEN
    v_src := replace(
      v_src,
      E'    waiting_started_at,\n    created_at, updated_at',
      E'    waiting_started_at,\n    ding_settle_mode,\n    created_at, updated_at'
    );
    v_src := replace(
      v_src,
      E'    v_now,\n    v_now,\n    v_now',
      E'    v_now,\n    game_core.fn_resolve_ding_settle_mode_for_new_room(),\n    v_now,\n    v_now'
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
BEGIN
  SELECT pg_get_functiondef(
           'tournament.fn_create_rooms_for_round(uuid,integer,uuid)'::regprocedure
         )
    INTO v_src;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'tournament.fn_create_rooms_for_round not found';
  END IF;

  IF v_src NOT LIKE '%ding_settle_mode%' THEN
    v_src := replace(
      v_src,
      E'      meta,\r\n      created_at,\r\n      updated_at\r\n    )\r\n    SELECT\r\n      format(',
      E'      meta,\r\n      created_at,\r\n      updated_at,\r\n      ding_settle_mode\r\n    )\r\n    SELECT\r\n      format('
    );
    v_src := replace(
      v_src,
      E'      v_now,\r\n      v_now\r\n    RETURNING id INTO v_game_room_id',
      E'      v_now,\r\n      v_now,\r\n      game_core.fn_resolve_ding_settle_mode_for_new_room()\r\n    RETURNING id INTO v_game_room_id'
    );
    -- Fallback if function body uses LF only.
    IF v_src NOT LIKE '%INSERT INTO public.rooms%d ing_settle_mode%' THEN
      v_src := replace(
        v_src,
        E'      meta,\n      created_at,\n      updated_at\n    )\n    SELECT\n      format(',
        E'      meta,\n      created_at,\n      updated_at,\n      ding_settle_mode\n    )\n    SELECT\n      format('
      );
      v_src := replace(
        v_src,
        E'      v_now,\n      v_now\n    RETURNING id INTO v_game_room_id',
        E'      v_now,\n      v_now,\n      game_core.fn_resolve_ding_settle_mode_for_new_room()\n    RETURNING id INTO v_game_room_id'
      );
      EXECUTE v_src;
    ELSE
      EXECUTE v_src;
    END IF;
  END IF;
END;
$patch$;

-- ---------------------------------------------------------------------------
-- public.load_test_seed_playing_rooms (load-test only; stamp for completeness)
-- ---------------------------------------------------------------------------
DO $patch$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(
           'public.load_test_seed_playing_rooms(integer,integer,integer,text)'::regprocedure
         )
    INTO v_src;

  IF v_src IS NOT NULL AND v_src NOT LIKE '%ding_settle_mode%' THEN
    v_src := replace(
      v_src,
      'meta, created_at, updated_at)',
      'meta, created_at, updated_at, ding_settle_mode)'
    );
    v_src := replace(
      v_src,
      '''load_test_seed''), v_now, v_now);',
      '''load_test_seed''), v_now, v_now, game_core.fn_resolve_ding_settle_mode_for_new_room());'
    );
    EXECUTE v_src;
  END IF;
EXCEPTION WHEN undefined_function THEN
  NULL;
END;
$patch$;

COMMIT;
