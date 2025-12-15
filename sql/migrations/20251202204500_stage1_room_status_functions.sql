-- Migration: Stage 1 room status functions update
-- Date: 2025-12-02

BEGIN;

-- Update lobby RPC defaults to include settling
CREATE OR REPLACE FUNCTION game_core.rpc_get_active_rooms(
  p_only_status public.room_status[] DEFAULT ARRAY[
    'waiting'::public.room_status,
    'playing'::public.room_status,
    'settling'::public.room_status
  ],
  p_price_min numeric DEFAULT NULL,
  p_price_max numeric DEFAULT NULL
)
RETURNS TABLE(
  room_id uuid,
  room_code text,
  status public.room_status,
  price numeric,
  currency text,
  players integer,
  tickets_reserved integer,
  tickets_consumed integer,
  starts_at timestamptz,
  next_draw_at timestamptz,
  min_players integer,
  countdown_sec integer,
  draw_interval_sec integer
)
LANGUAGE sql STABLE
AS $function$
  SELECT
    r.id                           AS room_id,
    r.room_code,
    r.status,
    r.card_price                   AS price,
    r.currency,
    COUNT(DISTINCT t.player_user_id)
      FILTER (WHERE t.reservation_status IN ('reserved','confirmed')) AS players,
    COUNT(*) FILTER (WHERE t.reservation_status = 'reserved')  AS tickets_reserved,
    COUNT(*) FILTER (WHERE t.reservation_status = 'consumed')  AS tickets_consumed,
    r.starts_at,
    r.next_draw_at,
    COALESCE(r.min_players, (r.meta->>'min_players')::int, 2)  AS min_players,
    COALESCE(r.countdown_sec, (r.meta->>'countdown_sec')::int, 120) AS countdown_sec,
    COALESCE((r.meta->>'draw_interval_sec')::int, 3)           AS draw_interval_sec
  FROM public.rooms r
  LEFT JOIN public.tickets t ON t.room_id = r.id
  WHERE r.status = ANY (p_only_status)
    AND (p_price_min IS NULL OR r.card_price >= p_price_min)
    AND (p_price_max IS NULL OR r.card_price <= p_price_max)
  GROUP BY r.id
  ORDER BY r.card_price, r.starts_at NULLS LAST, r.updated_at DESC;
$function$;

ALTER FUNCTION game_core.rpc_get_active_rooms(public.room_status[], numeric, numeric) OWNER TO postgres;

COMMENT ON FUNCTION game_core.rpc_get_active_rooms(public.room_status[], numeric, numeric) IS
  'Lobby feed: list active rooms (waiting/playing/settling by default) with player counts and timing. Optional price filters.';

CREATE OR REPLACE FUNCTION game_core.rpc_get_lobby_price_summary(
  p_only_status public.room_status[] DEFAULT ARRAY[
    'waiting'::public.room_status,
    'playing'::public.room_status,
    'settling'::public.room_status
  ]
)
RETURNS TABLE(
  price numeric,
  currency text,
  waiting_rooms integer,
  playing_rooms integer,
  total_rooms integer,
  players integer
)
LANGUAGE sql STABLE
AS $function$
  WITH room_base AS (
    SELECT r.id, r.card_price AS price, r.currency, r.status
    FROM public.rooms r
    WHERE r.status = ANY (p_only_status)
  ),
  players_per_room AS (
    SELECT t.room_id,
           COUNT(DISTINCT t.player_user_id)
             FILTER (WHERE t.reservation_status IN ('reserved','confirmed')) AS players
    FROM public.tickets t
    GROUP BY t.room_id
  )
  SELECT
    rb.price,
    rb.currency,
    COUNT(*) FILTER (WHERE rb.status = 'waiting') AS waiting_rooms,
    COUNT(*) FILTER (WHERE rb.status = 'playing') AS playing_rooms,
    COUNT(*)                                   AS total_rooms,
    COALESCE(SUM(ppr.players), 0)              AS players
  FROM room_base rb
  LEFT JOIN players_per_room ppr ON ppr.room_id = rb.id
  GROUP BY rb.price, rb.currency
  ORDER BY rb.price;
$function$;

ALTER FUNCTION game_core.rpc_get_lobby_price_summary(public.room_status[]) OWNER TO postgres;

COMMENT ON FUNCTION game_core.rpc_get_lobby_price_summary(public.room_status[]) IS
  'Lobby summary grouped by price/currency: counts of waiting/playing rooms (settling included in defaults) and total players.';

-- Update waiting-room manager to only change state and set next_draw_at
CREATE OR REPLACE FUNCTION game_core.fn_manage_waiting_rooms(
  p_limit integer DEFAULT 50,
  p_capture boolean DEFAULT false
)
RETURNS TABLE(
  room_id uuid,
  became_live_at timestamptz,
  paid_players integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  r record;
  v_now timestamptz := now();
  v_active_players integer;
  v_draw_interval integer;
BEGIN
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
      ) >= COALESCE(rm.min_players, 1)
    ORDER BY rm.starts_at ASC
    LIMIT p_limit
  LOOP
    SELECT COUNT(DISTINCT t.player_user_id)
      INTO v_active_players
      FROM public.tickets t
      WHERE t.room_id = r.id
        AND t.reservation_status IN ('reserved','confirmed');

    v_draw_interval := GREATEST(COALESCE(r.draw_interval_sec, 3), 1);

    UPDATE public.rooms
       SET status       = 'playing',
           next_draw_at = COALESCE(
                             r.next_draw_at,
                             v_now + make_interval(secs => v_draw_interval)
                           ),
           updated_at   = v_now
     WHERE id = r.id
       AND status = 'waiting';

    room_id        := r.id;
    became_live_at := v_now;
    paid_players   := COALESCE(v_active_players, 0);
    RETURN NEXT;
  END LOOP;

  -- extend countdown for rooms that did not reach min players
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
      ) < COALESCE(rm.min_players, 1)
    ORDER BY rm.starts_at ASC
    LIMIT p_limit
  LOOP
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
$function$;

ALTER FUNCTION game_core.fn_manage_waiting_rooms(integer, boolean) OWNER TO postgres;

COMMIT;
