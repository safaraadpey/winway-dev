-- Fix tournament.fn_create_rooms_for_round: remove erroneous ding_settle_mode from tickets INSERT.
BEGIN;

DO $fix$
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

  IF v_src LIKE '%updated_at,\r\n      ding_settle_mode\r\n    )\r\n    SELECT\r\n      v_game_room_id%' THEN
    v_src := replace(
      v_src,
      E'      updated_at,\r\n      ding_settle_mode\r\n    )\r\n    SELECT\r\n      v_game_room_id,',
      E'      updated_at\r\n    )\r\n    SELECT\r\n      v_game_room_id,'
    );
    EXECUTE v_src;
  ELSIF v_src LIKE '%updated_at,\n      ding_settle_mode\n    )\n    SELECT\n      v_game_room_id%' THEN
    v_src := replace(
      v_src,
      E'      updated_at,\n      ding_settle_mode\n    )\n    SELECT\n      v_game_room_id,',
      E'      updated_at\n    )\n    SELECT\n      v_game_room_id,'
    );
    EXECUTE v_src;
  END IF;
END;
$fix$;

COMMIT;
