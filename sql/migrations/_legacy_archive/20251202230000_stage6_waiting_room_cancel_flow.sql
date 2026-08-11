BEGIN;

-- Stage 6: waiting-room cancel flows using wallet hold releases

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_reason text;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Helper: cancel a single waiting room (internal use)
CREATE OR REPLACE FUNCTION game_core.fn_cancel_waiting_room_single(
  p_room uuid,
  p_actor uuid,
  p_reason text,
  p_require_single_player boolean,
  p_now timestamptz
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room record;
  v_ticket record;
  v_cancelled integer := 0;
  c_cancelable constant public.reservation_status[] := ARRAY['held'::public.reservation_status,'reserved'::public.reservation_status,'confirmed'::public.reservation_status];
BEGIN
  IF p_room IS NULL THEN
    RAISE EXCEPTION 'room id is required';
  END IF;

  SELECT *
    INTO v_room
  FROM public.rooms
  WHERE id = p_room
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room % not found', p_room;
  END IF;

  IF v_room.status = 'cancelled'::public.room_status THEN
    RAISE NOTICE 'room % already cancelled; skipping', p_room;
    RETURN 0;
  END IF;

  IF v_room.status <> 'waiting'::public.room_status THEN
    RAISE EXCEPTION 'room % is not cancellable (status=%)', p_room, v_room.status;
  END IF;

  IF v_room.starts_at IS NOT NULL AND v_room.starts_at <= p_now THEN
    RAISE EXCEPTION 'room % is already live (starts_at passed)', p_room;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tickets
    WHERE room_id = p_room
      AND reservation_status = 'consumed'::public.reservation_status
  ) THEN
    RAISE EXCEPTION 'room % is already live (consumed tickets exist)', p_room;
  END IF;

  IF p_require_single_player THEN
    IF p_actor IS NULL THEN
      RAISE EXCEPTION 'unauthorized';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tickets
      WHERE room_id = p_room
        AND reservation_status = ANY(c_cancelable)
        AND player_user_id <> p_actor
    ) THEN
      RAISE EXCEPTION 'cannot cancel room %: other players have tickets', p_room;
    END IF;
  END IF;

  FOR v_ticket IN
    SELECT id
    FROM public.tickets
    WHERE room_id = p_room
      AND reservation_status = ANY(c_cancelable)
    FOR UPDATE
  LOOP
    PERFORM game_finance.fn_wallet_release_join(v_ticket.id);
  END LOOP;

  UPDATE public.tickets
     SET reservation_status = 'cancelled'::public.reservation_status,
         cancelled_at = p_now,
         updated_at = p_now
   WHERE room_id = p_room
     AND reservation_status = ANY(c_cancelable);

  UPDATE public.rooms
     SET status = 'cancelled'::public.room_status,
         starts_at = NULL,
         ends_at = COALESCE(ends_at, p_now),
         cancelled_at = p_now,
         cancelled_by = p_actor,
         cancelled_reason = p_reason,
         updated_at = p_now
   WHERE id = p_room;

  v_cancelled := 1;
  RETURN v_cancelled;
END;
$$;

ALTER FUNCTION game_core.fn_cancel_waiting_room_single(uuid, uuid, text, boolean, timestamptz) OWNER TO postgres;


CREATE OR REPLACE FUNCTION game_core.fn_cancel_waiting_rooms(
  p_room uuid DEFAULT NULL,
  p_by_admin boolean DEFAULT false,
  p_requester uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_actor uuid := p_requester;
  v_actor_role public.user_role;
  v_cancelled integer := 0;
  v_room_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    BEGIN
      v_actor := auth.uid();
    EXCEPTION
      WHEN OTHERS THEN
        v_actor := NULL;
    END;
  END IF;

  IF NOT p_by_admin THEN
    IF p_room IS NULL THEN
      RAISE EXCEPTION 'room id is required for player cancels';
    END IF;
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'unauthorized';
    END IF;

    RETURN game_core.fn_cancel_waiting_room_single(p_room, v_actor, 'player_cancel', true, v_now);
  END IF;

  -- admin path
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT role INTO v_actor_role
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role IS DISTINCT FROM 'admin'::public.user_role THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_room IS NOT NULL THEN
    v_cancelled := v_cancelled + game_core.fn_cancel_waiting_room_single(p_room, v_actor, 'admin_cancel', false, v_now);
    RETURN v_cancelled;
  END IF;

  FOR v_room_id IN
    SELECT id
    FROM public.rooms
    WHERE status = 'waiting'::public.room_status
    ORDER BY created_at
  LOOP
    v_cancelled := v_cancelled + game_core.fn_cancel_waiting_room_single(v_room_id, v_actor, 'admin_cancel', false, v_now);
  END LOOP;

  RETURN v_cancelled;
END;
$$;

ALTER FUNCTION game_core.fn_cancel_waiting_rooms(uuid, boolean, uuid) OWNER TO postgres;


CREATE OR REPLACE FUNCTION public.fn_cancel_waiting_room(
  p_room uuid,
  p_by_admin boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid;
BEGIN
  BEGIN
    v_user := auth.uid();
  EXCEPTION
    WHEN OTHERS THEN
      v_user := NULL;
  END;

  RETURN game_core.fn_cancel_waiting_rooms(p_room, p_by_admin, v_user);
END;
$$;

ALTER FUNCTION public.fn_cancel_waiting_room(uuid, boolean) OWNER TO postgres;


CREATE OR REPLACE FUNCTION public.fn_cancel_waiting_room(
  p_room uuid,
  p_by_admin boolean,
  p_user uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN game_core.fn_cancel_waiting_rooms(p_room, p_by_admin, p_user);
END;
$$;

ALTER FUNCTION public.fn_cancel_waiting_room(uuid, boolean, uuid) OWNER TO postgres;

COMMIT;
