-- Fix: accumulate tournament lock amount for repeated buys on same entry.
-- Root cause: idempotency key is stable per entry (entry_hold:<entry_id>), so
-- repeated INSERT hit conflict and DO NOTHING left tournament_locks.amount stale.
--
-- This migration:
-- 1) Updates fn_tournament_wallet_hold to aggregate amount on conflict.
-- 2) Backfills existing held entry locks to match tournament_entries.amount.

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
    'ON CONFLICT \(tournament_id, idempotency_key\) WHERE idempotency_key IS NOT NULL DO NOTHING;',
    'ON CONFLICT (tournament_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET amount = public.tournament_locks.amount + EXCLUDED.amount, updated_at = EXCLUDED.updated_at, meta = COALESCE(public.tournament_locks.meta, ''{}''::jsonb) || COALESCE(EXCLUDED.meta, ''{}''::jsonb);',
    'g'
  );

  EXECUTE v_def;
END
$$;

-- One-time data reconciliation for already-mismatched held entry locks.
WITH target AS (
  SELECT l.id, e.amount AS desired_amount
  FROM public.tournament_locks l
  JOIN public.tournament_entries e
    ON e.id = l.entry_id
   AND e.tournament_id = l.tournament_id
  WHERE l.lock_kind = 'entry'
    AND l.status = 'held'
    AND l.idempotency_key = ('entry_hold:' || l.entry_id::text)
    AND l.amount <> e.amount
)
UPDATE public.tournament_locks l
SET amount = t.desired_amount,
    updated_at = now()
FROM target t
WHERE l.id = t.id;
