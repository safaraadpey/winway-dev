-- Ensure entry locks are captured when tournament finishes (non-DING),
-- and backfill already-finished tournaments with stale held locks.

CREATE OR REPLACE FUNCTION tournament.fn_capture_entry_locks(p_tournament_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  r_lock record;
  v_now timestamptz := now();
  v_currency text;
  v_wallet_id uuid;
  v_locked numeric;
  v_count int := 0;
BEGIN
  FOR r_lock IN
    SELECT l.id, l.owner_user_id, l.amount, l.wallet_id, l.entry_id, l.meta
    FROM public.tournament_locks l
    WHERE l.tournament_id = p_tournament_id
      AND l.lock_kind = 'entry'
      AND l.status = 'held'
      AND upper(coalesce(l.meta->>'currency', 'IRR')) <> 'DING'
    FOR UPDATE
  LOOP
    v_currency := upper(coalesce(r_lock.meta->>'currency', 'IRR'));

    IF r_lock.amount IS NULL OR r_lock.amount <= 0 THEN
      UPDATE public.tournament_locks
         SET status = 'captured',
             amount = 0,
             captured_at = v_now,
             updated_at = v_now,
             meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('captured_at', v_now, 'capture_note', 'zero_or_null_amount_lock')
       WHERE id = r_lock.id;
      CONTINUE;
    END IF;

    IF r_lock.wallet_id IS NOT NULL THEN
      SELECT w.id, w.locked_amount
        INTO v_wallet_id, v_locked
      FROM public.wallets w
      WHERE w.id = r_lock.wallet_id
      FOR UPDATE;
    ELSE
      SELECT w.id, w.locked_amount
        INTO v_wallet_id, v_locked
      FROM public.wallets w
      WHERE w.user_id = r_lock.owner_user_id
        AND w.currency = v_currency
      FOR UPDATE;
    END IF;

    IF v_wallet_id IS NULL THEN
      RAISE EXCEPTION 'wallet not found for lock %, user %, currency %', r_lock.id, r_lock.owner_user_id, v_currency;
    END IF;

    IF COALESCE(v_locked, 0) < r_lock.amount THEN
      RAISE EXCEPTION 'insufficient locked_amount to capture lock %, have %, need %', r_lock.id, v_locked, r_lock.amount;
    END IF;

    UPDATE public.wallets
       SET locked_amount = locked_amount - r_lock.amount,
           updated_at = v_now
     WHERE id = v_wallet_id;

    UPDATE public.tournament_locks
       SET status = 'captured',
           amount = 0,
           wallet_id = v_wallet_id,
           captured_at = v_now,
           updated_at = v_now,
           meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('captured_at', v_now)
     WHERE id = r_lock.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('tournament.fn_manage_tournament_cycle(uuid,bigint)'::regprocedure)
    INTO v_def;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'function tournament.fn_manage_tournament_cycle(uuid,bigint) not found';
  END IF;

  IF strpos(v_def, 'PERFORM tournament.fn_capture_entry_locks(p_tournament_id);') = 0 THEN
    v_def := replace(
      v_def,
      'PERFORM tournament.fn_settle_commission_payouts(p_tournament_id);',
      'PERFORM tournament.fn_settle_commission_payouts(p_tournament_id);
      PERFORM tournament.fn_capture_entry_locks(p_tournament_id);'
    );
  END IF;

  EXECUTE v_def;
END
$$;

-- Backfill finished tournaments that still have held non-DING entry locks.
DO $$
DECLARE
  r_t record;
BEGIN
  FOR r_t IN
    SELECT DISTINCT l.tournament_id
    FROM public.tournament_locks l
    JOIN public.tournaments t ON t.id = l.tournament_id
    WHERE t.status = 'finished'
      AND l.lock_kind = 'entry'
      AND l.status = 'held'
      AND upper(coalesce(l.meta->>'currency', 'IRR')) <> 'DING'
  LOOP
    BEGIN
      PERFORM tournament.fn_capture_entry_locks(r_t.tournament_id);
    EXCEPTION WHEN OTHERS THEN
      -- Keep migration resilient for historical inconsistent data.
      RAISE NOTICE 'skip tournament %: %', r_t.tournament_id, SQLERRM;
    END;
  END LOOP;
END
$$;
