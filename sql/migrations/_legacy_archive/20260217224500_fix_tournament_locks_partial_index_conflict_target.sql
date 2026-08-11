-- Fix: align ON CONFLICT inference with partial unique index on tournament_locks
-- Unique index: (tournament_id, idempotency_key) WHERE idempotency_key IS NOT NULL
-- Therefore conflict target must include matching predicate.

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

  -- Normalize any previous variant to the predicate-matching form.
  v_def := regexp_replace(
    v_def,
    'ON CONFLICT \(idempotency_key\) DO NOTHING;',
    'ON CONFLICT (tournament_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;',
    'g'
  );

  v_def := regexp_replace(
    v_def,
    'ON CONFLICT \(tournament_id, idempotency_key\) DO NOTHING;',
    'ON CONFLICT (tournament_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;',
    'g'
  );

  EXECUTE v_def;
END
$$;
