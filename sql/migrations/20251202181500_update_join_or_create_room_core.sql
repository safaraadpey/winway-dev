-- Migration: ensure tickets get price snapshot on creation
-- Date: 2025-12-02

BEGIN;

CREATE OR REPLACE FUNCTION game_core.fn_join_or_create_room_core(
  p_template_id uuid,
  p_card_count integer,
  p_password text
)
RETURNS TABLE(room_id uuid, starts_at timestamptz, ticket_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_room_seed      bytea;
  v_room_seed_hash char(64);

  v_user           uuid := auth.uid();
  v_price          numeric;
  v_currency       text;
  v_min_players    int;
  v_cd             int;
  v_max_cards_pp   int;
  v_pool           uuid;
  v_room           uuid;
  v_room_type      public.room_type;
  v_sched_time     time;
  v_required_password text;

  v_taken          int := 0;
  v_ticket_ids     uuid[] := '{}';
  r_card           record;
  v_now            timestamptz := now();
  v_starts_at      timestamptz;
BEGIN
  IF p_template_id IS NULL OR p_card_count IS NULL OR p_card_count < 1 THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  SELECT price,
         currency,
         COALESCE(min_players, 1),
         COALESCE(countdown_sec, 120),
         COALESCE(max_cards_per_player, 999999),
         room_type,
         scheduled_start_time,
         password
    INTO v_price,
         v_currency,
         v_min_players,
         v_cd,
         v_max_cards_pp,
         v_room_type,
         v_sched_time,
         v_required_password
  FROM public.room_templates
  WHERE id = p_template_id;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'room template not found: %', p_template_id;
  END IF;

  IF v_required_password IS NOT NULL
     AND (p_password IS NULL OR p_password <> v_required_password) THEN
    RAISE EXCEPTION 'invalid room password';
  END IF;

  SELECT id
    INTO v_pool
  FROM public.card_pools
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_pool IS NULL THEN
    RAISE EXCEPTION 'no active card pool';
  END IF;

  SELECT r.id, r.starts_at
    INTO v_room, v_starts_at
  FROM public.rooms r
  WHERE r.status = 'waiting'
    AND r.room_template_id = p_template_id
  ORDER BY r.created_at ASC
  LIMIT 1;

  IF v_room IS NULL THEN
    BEGIN
      SELECT seed, seed_hash
        INTO v_room_seed, v_room_seed_hash
      FROM game_core.fn_generate_room_seed();

      INSERT INTO public.rooms AS r(
        id, room_template_id, status,
        card_price, currency, pool_id,
        starts_at, created_by, meta,
        min_players, countdown_sec, max_cards_per_player,
        room_seed, room_seed_hash,
        created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        p_template_id,
        'waiting'::room_status,
        v_price, v_currency, v_pool,
        CASE
          WHEN v_room_type = 'tournament'
               AND v_sched_time IS NOT NULL
            THEN (v_now::date + v_sched_time)::timestamptz
          ELSE NULL
        END,
        v_user,
        jsonb_build_object(
          'source','template_snapshot',
          'min_players', v_min_players,
          'countdown_sec', v_cd
        ),
        v_min_players, v_cd, v_max_cards_pp,
        v_room_seed, v_room_seed_hash,
        v_now, v_now
      )
      RETURNING r.id, r.starts_at INTO v_room, v_starts_at;

    EXCEPTION
      WHEN unique_violation THEN
        SELECT r.id, r.starts_at
          INTO v_room, v_starts_at
        FROM public.rooms r
        WHERE r.status = 'waiting'
          AND r.room_template_id = p_template_id
        ORDER BY r.created_at ASC
        LIMIT 1;

        IF v_room IS NULL THEN
          RAISE EXCEPTION 'race detected but no waiting room found';
        END IF;
    END;
  END IF;

  IF v_room_seed IS NULL THEN
    SELECT room_seed
      INTO v_room_seed
    FROM public.rooms
    WHERE id = v_room;

    IF v_room_seed IS NULL THEN
      RAISE EXCEPTION 'room % has no room_seed', v_room;
    END IF;
  END IF;

  IF (
      SELECT COUNT(*)
      FROM public.tickets t_count
      WHERE t_count.room_id = v_room
        AND t_count.player_user_id = v_user
        AND t_count.reservation_status IN ('reserved','confirmed','consumed')
     ) + p_card_count > v_max_cards_pp
  THEN
    RAISE EXCEPTION 'max_cards_per_player exceeded';
  END IF;

  FOR r_card IN
    SELECT c.id AS pool_card_id, c.card_no
      FROM public.card_pool_cards c
     WHERE c.pool_id = v_pool
       AND (
         v_room_type = 'tournament'
         OR c.card_no <= 200
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.tickets t
          WHERE t.pool_card_id = c.id
            AND t.room_id      = v_room
            AND t.reservation_status IN ('reserved','confirmed','consumed')
       )
     ORDER BY digest(
       encode(v_room_seed, 'hex') || ':' || c.id::text,
       'sha256'
     )
     LIMIT p_card_count
     FOR UPDATE SKIP LOCKED
  LOOP
    v_taken := v_taken + 1;

    WITH ins AS (
      INSERT INTO public.tickets(
        id, room_id, player_user_id, pool_card_id, card_no,
        price, reservation_status, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(), v_room, v_user, r_card.pool_card_id, r_card.card_no,
        v_price,
        'reserved',
        v_now, v_now
      )
      RETURNING id
    )
    SELECT array_append(v_ticket_ids, id) INTO v_ticket_ids FROM ins;
  END LOOP;

  IF v_taken <> p_card_count THEN
    RAISE EXCEPTION
      'not enough free cards in pool for this room (wanted %, got %)',
      p_card_count, v_taken;
  END IF;

  UPDATE public.rooms r
     SET starts_at = CASE
                       WHEN r.starts_at IS NOT NULL THEN r.starts_at
                       WHEN v_room_type = 'normal'
                         THEN v_now + make_interval(secs => v_cd)
                       ELSE r.starts_at
                     END,
         updated_at = v_now
   WHERE r.id = v_room
  RETURNING r.starts_at INTO v_starts_at;

  room_id    := v_room;
  starts_at  := v_starts_at;
  ticket_ids := v_ticket_ids;

  RETURN;
END;
$function$;

ALTER FUNCTION game_core.fn_join_or_create_room_core(uuid, integer, text) OWNER TO postgres;

COMMIT;


