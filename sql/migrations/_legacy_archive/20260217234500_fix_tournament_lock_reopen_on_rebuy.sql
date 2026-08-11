-- Fix: when rebuy hits an existing released lock row, reopen it as held
-- and reset amount correctly instead of leaving status=released.
--
-- Also backfill inconsistent rows where:
--   entry is created, wallet still locked, but lock row is released.

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

  v_def := regexp_replace(
    v_def,
    'DO UPDATE SET amount = public\.tournament_locks\.amount \+ EXCLUDED\.amount, updated_at = EXCLUDED\.updated_at, meta = COALESCE\(public\.tournament_locks\.meta, ''\{\}''::jsonb\) \|\| COALESCE\(EXCLUDED\.meta, ''\{\}''::jsonb\);',
    'DO UPDATE SET status = ''held'', amount = CASE WHEN public.tournament_locks.status = ''released'' THEN EXCLUDED.amount ELSE public.tournament_locks.amount + EXCLUDED.amount END, wallet_id = COALESCE(EXCLUDED.wallet_id, public.tournament_locks.wallet_id), entry_id = COALESCE(EXCLUDED.entry_id, public.tournament_locks.entry_id), updated_at = EXCLUDED.updated_at, meta = COALESCE(public.tournament_locks.meta, ''{}''::jsonb) || COALESCE(EXCLUDED.meta, ''{}''::jsonb);',
    'g'
  );

  EXECUTE v_def;
END
$$;

-- One-time repair for inconsistent rows:
-- created entry + locked wallet, but lock status is released.
WITH base AS (
  SELECT
    l.id AS lock_id,
    e.amount AS entry_amount
  FROM public.tournament_locks l
  JOIN public.tournament_entries e
    ON e.id = l.entry_id
   AND e.tournament_id = l.tournament_id
  JOIN public.wallets w
    ON w.user_id = e.user_id
   AND w.currency = COALESCE(l.meta->>'currency', 'IRR')
  WHERE l.lock_kind = 'entry'
    AND l.idempotency_key = ('entry_hold:' || e.id::text)
    AND e.status = 'created'
    AND COALESCE(w.locked_amount, 0) > 0
    AND l.status = 'released'
)
UPDATE public.tournament_locks l
SET status = 'held',
    amount = b.entry_amount,
    updated_at = now()
FROM base b
WHERE l.id = b.lock_id;
