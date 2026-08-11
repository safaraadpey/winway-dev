-- Fix: tournament_locks upsert conflict target must match unique index
-- Root cause: ON CONFLICT (idempotency_key) had no matching unique/exclusion constraint
-- Existing unique index is on (tournament_id, idempotency_key) with partial predicate.

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(
           'public.fn_tournament_wallet_hold(uuid, integer, text, uuid)'::regprocedure
         )
    INTO v_def;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'function public.fn_tournament_wallet_hold(uuid, integer, text, uuid) not found';
  END IF;

  -- Keep all current function logic intact; only fix the conflict target.
  v_def := regexp_replace(
    v_def,
    'ON CONFLICT \(idempotency_key\) DO NOTHING;',
    'ON CONFLICT (tournament_id, idempotency_key) DO NOTHING;',
    'g'
  );

  EXECUTE v_def;
END
$$;
