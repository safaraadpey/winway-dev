BEGIN;

CREATE OR REPLACE FUNCTION tournament.fn_burn_ding_locks(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  r_lock record;
  v_now timestamptz := now();
  v_locked bigint;
BEGIN
  FOR r_lock IN
    SELECT id, owner_user_id, amount
    FROM public.tournament_locks
    WHERE tournament_id = p_tournament_id
      AND lock_kind = 'entry'
      AND status = 'held'
      AND (meta->>'currency') = 'DING'
    FOR UPDATE
  LOOP
    SELECT locked_amount
      INTO v_locked
    FROM public.ding_balances
    WHERE user_id = r_lock.owner_user_id
    FOR UPDATE;

    IF v_locked IS NULL OR v_locked < r_lock.amount THEN
      RAISE EXCEPTION 'insufficient locked ding balance for user %', r_lock.owner_user_id;
    END IF;

    UPDATE public.ding_balances
       SET locked_amount = locked_amount - r_lock.amount::bigint,
           updated_at = v_now
     WHERE user_id = r_lock.owner_user_id;

    UPDATE public.tournament_locks
       SET status = 'captured',
           amount = 0,
           captured_at = v_now,
           updated_at = v_now,
           meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('burned_at', v_now)
     WHERE id = r_lock.id;
  END LOOP;

  RETURN;
END;
$function$;

COMMIT;

