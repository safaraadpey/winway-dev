-- Dev helper: register a super/agent downline (username prefix) into an open tournament.
-- Idempotent: skips created/settled entries. Uses the same hold path as the player UI.

BEGIN;

CREATE OR REPLACE FUNCTION tournament.fn_dev_register_downline_prefix(
  p_parent_username text,
  p_username_prefix text,
  p_tournament_title text DEFAULT NULL,
  p_tournament_id uuid DEFAULT NULL,
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
  v_parent_id uuid;
  v_parent_role text;
  v_tournament_id uuid;
  v_tournament_title text;
  v_status public.tournament_status;
  v_currency text;
  v_qty integer := GREATEST(COALESCE(p_qty, 1), 1);
  r record;
  v_entry uuid;
  v_existing_status public.tournament_entry_status;
BEGIN
  IF COALESCE(btrim(p_parent_username), '') = '' THEN
    RAISE EXCEPTION '[DevRegister] parent username is required';
  END IF;
  IF COALESCE(btrim(p_username_prefix), '') = '' THEN
    RAISE EXCEPTION '[DevRegister] username prefix is required';
  END IF;
  IF p_tournament_id IS NULL AND COALESCE(btrim(p_tournament_title), '') = '' THEN
    RAISE EXCEPTION '[DevRegister] tournament title or id is required';
  END IF;

  SELECT u.id, u.role::text
    INTO v_parent_id, v_parent_role
  FROM public.users u
  WHERE lower(u.username) = lower(btrim(p_parent_username))
    AND u.status = 'active'
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION '[DevRegister] parent not found or inactive: %', p_parent_username;
  END IF;

  IF v_parent_role NOT IN ('super', 'agent', 'admin') THEN
    RAISE EXCEPTION '[DevRegister] parent must be super/agent/admin, got %', v_parent_role;
  END IF;

  IF p_tournament_id IS NOT NULL THEN
    SELECT t.id, t.title, t.status,
           upper(coalesce(nullif(t.meta->>'entry_currency', ''), t.currency, 'IRR'))
      INTO v_tournament_id, v_tournament_title, v_status, v_currency
    FROM public.tournaments t
    WHERE t.id = p_tournament_id;
  ELSE
    SELECT t.id, t.title, t.status,
           upper(coalesce(nullif(t.meta->>'entry_currency', ''), t.currency, 'IRR'))
      INTO v_tournament_id, v_tournament_title, v_status, v_currency
    FROM public.tournaments t
    WHERE regexp_replace(lower(t.title), '\s+', '', 'g')
        = regexp_replace(lower(btrim(p_tournament_title)), '\s+', '', 'g')
    ORDER BY CASE WHEN t.status = 'registration_open'::public.tournament_status THEN 0 ELSE 1 END,
             t.created_at DESC
    LIMIT 1;
  END IF;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION '[DevRegister] tournament not found: %', coalesce(p_tournament_title, p_tournament_id::text);
  END IF;

  IF v_status <> 'registration_open'::public.tournament_status THEN
    RAISE EXCEPTION '[DevRegister] tournament % is not registration_open (status=%)',
      v_tournament_title, v_status;
  END IF;

  RAISE LOG '[DevRegister] Started parent=% prefix=% tournament=% (%) qty=%',
    p_parent_username, p_username_prefix, v_tournament_title, v_tournament_id, v_qty;

  FOR r IN
    SELECT DISTINCT u.id, u.username
    FROM public.users u
    LEFT JOIN public.player_affiliation pa ON pa.user_id = u.id
    WHERE u.role = 'player'
      AND u.status = 'active'
      AND lower(u.username) LIKE lower(btrim(p_username_prefix)) || '%'
      AND (
        u.parent_id = v_parent_id
        OR pa.super_id = v_parent_id
        OR pa.agent_id = v_parent_id
      )
    ORDER BY u.username
  LOOP
    SELECT te.id, te.status
      INTO v_entry, v_existing_status
    FROM public.tournament_entries te
    WHERE te.tournament_id = v_tournament_id
      AND te.user_id = r.id
    LIMIT 1;

    IF v_entry IS NOT NULL AND v_existing_status IN (
      'created'::public.tournament_entry_status,
      'settled'::public.tournament_entry_status
    ) THEN
      username := r.username;
      user_id := r.id;
      entry_id := v_entry;
      action := 'skipped';
      detail := format('already %s', v_existing_status);
      RETURN NEXT;
      CONTINUE;
    END IF;

    BEGIN
      PERFORM set_config('request.jwt.claim.sub', r.id::text, true);
      PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', r.id)::text,
        true
      );

      v_entry := public.fn_tournament_wallet_hold(
        v_tournament_id,
        v_qty,
        v_currency,
        CASE
          WHEN v_existing_status = 'cancelled'::public.tournament_entry_status THEN v_entry
          ELSE NULL
        END
      );

      username := r.username;
      user_id := r.id;
      entry_id := v_entry;
      action := 'registered';
      detail := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      username := r.username;
      user_id := r.id;
      entry_id := NULL;
      action := 'failed';
      detail := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  RAISE LOG '[DevRegister] Finished parent=% tournament=%',
    p_parent_username, v_tournament_title;
END;
$function$;

REVOKE ALL ON FUNCTION tournament.fn_dev_register_downline_prefix(text, text, text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tournament.fn_dev_register_downline_prefix(text, text, text, uuid, integer) TO postgres;
GRANT EXECUTE ON FUNCTION tournament.fn_dev_register_downline_prefix(text, text, text, uuid, integer) TO service_role;

COMMIT;
