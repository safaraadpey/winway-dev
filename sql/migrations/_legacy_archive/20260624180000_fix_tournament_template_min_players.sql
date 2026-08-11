-- Tournament room templates must satisfy room_templates_min_players_check (>= 2).
-- fn_create_or_get_table_template still inserted min_players = 1 (hardcoded since 20260209).

BEGIN;

CREATE OR REPLACE FUNCTION tournament.fn_create_or_get_table_template(
  p_tournament_id uuid,
  p_round_no integer,
  p_table_no integer
)
RETURNS TABLE(template_id uuid, template_password text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_trr_id uuid;
  v_meta jsonb;
  v_target_players int;

  v_existing_template_id uuid;
  v_existing_password text;

  v_template_id uuid;
  v_template_price numeric;
  v_password text;
  v_min_players int;

  v_room_type public.room_type := 'tournament'::public.room_type;
BEGIN
  SELECT id, meta, room_template_id, target_players
    INTO v_trr_id, v_meta, v_existing_template_id, v_target_players
  FROM public.tournament_round_rooms
  WHERE tournament_id = p_tournament_id
    AND round_no = p_round_no
    AND table_no = p_table_no
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'tournament_round_room not found (tid=%, round=%, table=%)',
      p_tournament_id, p_round_no, p_table_no;
  END IF;

  IF v_existing_template_id IS NOT NULL THEN
    v_existing_password := NULLIF(COALESCE(v_meta->>'template_password', ''), '');
    template_id := v_existing_template_id;
    template_password := v_existing_password;
    RETURN NEXT;
    RETURN;
  END IF;

  v_min_players := GREATEST(COALESCE(v_target_players, 2), 2);

  v_password := md5(clock_timestamp()::text || ':' || random()::text || ':' || p_tournament_id::text);

  BEGIN
    v_template_id := tournament.fn_pick_free_room_template(v_room_type);
  EXCEPTION
    WHEN OTHERS THEN
      v_template_id := NULL;
  END;

  IF v_template_id IS NOT NULL THEN
    SELECT price
      INTO v_template_price
    FROM public.room_templates
    WHERE id = v_template_id;

    IF v_template_price IS DISTINCT FROM 0 THEN
      v_template_id := NULL;
    END IF;
  END IF;

  IF v_template_id IS NULL THEN
    INSERT INTO public.room_templates(
      status,
      room_type,
      price,
      currency,
      min_players,
      countdown_sec,
      max_cards_per_player,
      scheduled_start_time,
      password,
      created_at,
      updated_at
    )
    VALUES (
      'active'::public.room_template_status,
      v_room_type,
      0,
      'IRR',
      v_min_players,
      30,
      999999,
      NULL,
      v_password,
      now(),
      now()
    )
    RETURNING id INTO v_template_id;
  END IF;

  UPDATE public.tournament_round_rooms
     SET room_template_id = v_template_id,
         meta = COALESCE(meta, '{}'::jsonb) ||
               jsonb_build_object(
                 'template_assigned_at', now(),
                 'template_id', v_template_id,
                 'template_password', v_password,
                 'room_type', v_room_type,
                 'table_min', v_min_players
               )
   WHERE id = v_trr_id
     AND room_template_id IS NULL;

  template_id := v_template_id;
  template_password := v_password;
  RETURN NEXT;
  RETURN;
END;
$function$;

COMMIT;
