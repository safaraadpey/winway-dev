-- Dev Panel: scheduled tournament registration queue + register-by-user-ids helper.

BEGIN;

CREATE TABLE IF NOT EXISTS tournament.dev_registration_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'registered', 'skipped', 'failed', 'cancelled')),
  error_text text,
  entry_id uuid,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_registration_schedule_pending_due_idx
  ON tournament.dev_registration_schedule (scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS dev_registration_schedule_batch_idx
  ON tournament.dev_registration_schedule (batch_id);

CREATE UNIQUE INDEX IF NOT EXISTS dev_registration_schedule_active_user_tournament_idx
  ON tournament.dev_registration_schedule (tournament_id, user_id)
  WHERE status IN ('pending', 'registered');

CREATE OR REPLACE FUNCTION tournament._dev_register_user_hold(
  p_tournament_id uuid,
  p_user_id uuid,
  p_qty integer DEFAULT 1
)
RETURNS TABLE (
  username text,
  user_id uuid,
  entry_id uuid,
  action text,
  detail text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'tournament', 'pg_temp'
AS $function$
DECLARE
  v_username text;
  v_status public.tournament_status;
  v_currency text;
  v_qty integer := GREATEST(COALESCE(p_qty, 1), 1);
  v_entry uuid;
  v_existing_status public.tournament_entry_status;
BEGIN
  SELECT u.username
    INTO v_username
  FROM public.users u
  WHERE u.id = p_user_id
    AND u.role = 'player'
    AND u.status = 'active';

  IF v_username IS NULL THEN
    username := NULL;
    user_id := p_user_id;
    entry_id := NULL;
    action := 'failed';
    detail := 'player not found or inactive';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT t.status,
         upper(coalesce(nullif(t.meta->>'entry_currency', ''), t.currency, 'IRR'))
    INTO v_status, v_currency
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF v_status IS NULL THEN
    username := v_username;
    user_id := p_user_id;
    entry_id := NULL;
    action := 'failed';
    detail := 'tournament not found';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_status <> 'registration_open'::public.tournament_status THEN
    username := v_username;
    user_id := p_user_id;
    entry_id := NULL;
    action := 'failed';
    detail := format('tournament not registration_open (%s)', v_status);
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT te.id, te.status
    INTO v_entry, v_existing_status
  FROM public.tournament_entries te
  WHERE te.tournament_id = p_tournament_id
    AND te.user_id = p_user_id
  LIMIT 1;

  IF v_entry IS NOT NULL AND v_existing_status IN (
    'created'::public.tournament_entry_status,
    'settled'::public.tournament_entry_status
  ) THEN
    username := v_username;
    user_id := p_user_id;
    entry_id := v_entry;
    action := 'skipped';
    detail := format('already %s', v_existing_status);
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id)::text,
    true
  );

  v_entry := public.fn_tournament_wallet_hold(
    p_tournament_id,
    v_qty,
    v_currency,
    CASE
      WHEN v_existing_status = 'cancelled'::public.tournament_entry_status THEN v_entry
      ELSE NULL
    END
  );

  username := v_username;
  user_id := p_user_id;
  entry_id := v_entry;
  action := 'registered';
  detail := NULL;
  RETURN NEXT;
EXCEPTION WHEN OTHERS THEN
  username := v_username;
  user_id := p_user_id;
  entry_id := NULL;
  action := 'failed';
  detail := SQLERRM;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION tournament.fn_dev_register_user_ids(
  p_tournament_id uuid,
  p_user_ids uuid[],
  p_qty integer DEFAULT 1
)
RETURNS TABLE (
  username text,
  user_id uuid,
  entry_id uuid,
  action text,
  detail text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'tournament', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid;
  r record;
BEGIN
  IF p_tournament_id IS NULL THEN
    RAISE EXCEPTION '[DevRegister] tournament_id is required';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RAISE LOG '[DevRegister] fn_dev_register_user_ids tournament=% count=% qty=%',
    p_tournament_id, array_length(p_user_ids, 1), p_qty;

  FOREACH v_uid IN ARRAY p_user_ids LOOP
    FOR r IN
      SELECT *
      FROM tournament._dev_register_user_hold(p_tournament_id, v_uid, p_qty)
    LOOP
      username := r.username;
      user_id := r.user_id;
      entry_id := r.entry_id;
      action := r.action;
      detail := r.detail;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION tournament.fn_tick_dev_registration_schedule(
  p_limit integer DEFAULT 50
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'tournament', 'pg_temp'
AS $function$
DECLARE
  v_limit integer := GREATEST(COALESCE(p_limit, 50), 1);
  v_processed integer := 0;
  r_row record;
  r_result record;
BEGIN
  FOR r_row IN
    SELECT s.id, s.tournament_id, s.user_id, s.scheduled_at
    FROM tournament.dev_registration_schedule s
    WHERE s.status = 'pending'
      AND s.scheduled_at <= now()
    ORDER BY s.scheduled_at ASC, s.created_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      FOR r_result IN
        SELECT *
        FROM tournament._dev_register_user_hold(r_row.tournament_id, r_row.user_id, 1)
      LOOP
        UPDATE tournament.dev_registration_schedule
        SET status = r_result.action,
            entry_id = r_result.entry_id,
            error_text = r_result.detail,
            processed_at = now(),
            updated_at = now()
        WHERE id = r_row.id;

        v_processed := v_processed + 1;

        RAISE LOG '[DevRegister] tick schedule_id=% user=% action=% detail=%',
          r_row.id, r_result.username, r_result.action, coalesce(r_result.detail, '');
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      UPDATE tournament.dev_registration_schedule
      SET status = 'failed',
          error_text = SQLERRM,
          processed_at = now(),
          updated_at = now()
      WHERE id = r_row.id;

      v_processed := v_processed + 1;
      RAISE LOG '[DevRegister] tick failed schedule_id=% error=%', r_row.id, SQLERRM;
    END;
  END LOOP;

  IF v_processed > 0 THEN
    RAISE LOG '[DevRegister] tick processed=%', v_processed;
  END IF;

  RETURN v_processed;
END;
$function$;

REVOKE ALL ON TABLE tournament.dev_registration_schedule FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tournament.dev_registration_schedule TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tournament.dev_registration_schedule TO postgres;

REVOKE ALL ON FUNCTION tournament._dev_register_user_hold(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tournament._dev_register_user_hold(uuid, uuid, integer) TO postgres, service_role;

REVOKE ALL ON FUNCTION tournament.fn_dev_register_user_ids(uuid, uuid[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tournament.fn_dev_register_user_ids(uuid, uuid[], integer) TO postgres, service_role;

REVOKE ALL ON FUNCTION tournament.fn_tick_dev_registration_schedule(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tournament.fn_tick_dev_registration_schedule(integer) TO postgres, service_role;

-- Public wrapper for Supabase RPC (game engine orchestrator).
CREATE OR REPLACE FUNCTION public.fn_tick_dev_registration_schedule(p_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'tournament', 'pg_temp'
AS $$
  SELECT tournament.fn_tick_dev_registration_schedule(p_limit);
$$;

REVOKE ALL ON FUNCTION public.fn_tick_dev_registration_schedule(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tick_dev_registration_schedule(integer) TO postgres, service_role;

COMMIT;
