-- P3.1 — Tournament metadata consistency (non-financial)
--
-- Fixes:
-- 1) entry status stays 'created' after finish → add 'settled' + mark on completion
-- 2) lock amount zeroed on capture is intentional (remaining outstanding);
--    preserve original captured amount in meta.captured_amount (immutable once set)
-- 3) tournaments.commission_snapshot_at never set → set on successful snapshot
--
-- Does NOT recreate/alter wallets, transactions, prize, or commission payouts.

-- ---------------------------------------------------------------------------
-- 1) Enum: settled = participating entry after tournament fully settled
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'tournament_entry_status'
      AND e.enumlabel = 'settled'
  ) THEN
    ALTER TYPE public.tournament_entry_status ADD VALUE 'settled';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Guard: allow created → settled after tournament is settling/finished
--    (only status may change; financial fields stay immutable)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tournament.trg_guard_tournament_entry_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  v_status public.tournament_status;
BEGIN
  SELECT t.status
    INTO v_status
  FROM public.tournaments t
  WHERE t.id = COALESCE(NEW.tournament_id, OLD.tournament_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found for entry';
  END IF;

  -- Narrow metadata transition after settle/finish.
  IF TG_OP = 'UPDATE'
     AND v_status IN ('settling'::public.tournament_status, 'finished'::public.tournament_status)
     AND OLD.status = 'created'::public.tournament_entry_status
     AND NEW.status = 'settled'::public.tournament_entry_status
     AND NEW.tournament_id IS NOT DISTINCT FROM OLD.tournament_id
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.tickets_count IS NOT DISTINCT FROM OLD.tickets_count
     AND NEW.price_per_ticket IS NOT DISTINCT FROM OLD.price_per_ticket
  THEN
    RETURN NEW;
  END IF;

  IF v_status IN ('running'::public.tournament_status, 'settling'::public.tournament_status, 'finished'::public.tournament_status) THEN
    RAISE EXCEPTION 'tournament is locked; entries cannot be changed (status=%)', v_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Capture: keep amount=0 as remaining outstanding; store captured_amount
-- ---------------------------------------------------------------------------
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
  v_captured_amount numeric;
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
    v_captured_amount := COALESCE(r_lock.amount, 0);

    IF r_lock.amount IS NULL OR r_lock.amount <= 0 THEN
      UPDATE public.tournament_locks
         SET status = 'captured',
             amount = 0,
             captured_at = v_now,
             updated_at = v_now,
             meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
               'captured_at', v_now,
               'capture_note', 'zero_or_null_amount_lock',
               'captured_amount', COALESCE(
                 NULLIF(meta->>'captured_amount', '')::numeric,
                 0
               )
             )
       WHERE id = r_lock.id
         AND status = 'held';
      CONTINUE;
    END IF;

    IF r_lock.wallet_id IS NOT NULL THEN
      SELECT w.id, w.locked_amount INTO v_wallet_id, v_locked
      FROM public.wallets w
      WHERE w.id = r_lock.wallet_id
      FOR UPDATE;
    ELSE
      SELECT w.id, w.locked_amount INTO v_wallet_id, v_locked
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

    -- amount=0 means no outstanding hold left (intentional accounting).
    -- captured_amount is immutable once set.
    UPDATE public.tournament_locks
       SET status = 'captured',
           amount = 0,
           wallet_id = v_wallet_id,
           captured_at = v_now,
           updated_at = v_now,
           meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
             'captured_at', v_now,
             'captured_amount', COALESCE(
               NULLIF(meta->>'captured_amount', '')::numeric,
               v_captured_amount
             )
           )
     WHERE id = r_lock.id
       AND status = 'held';

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Snapshot helpers: stamp commission_snapshot_at (first success wins)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tournament.fn_touch_commission_snapshot_at(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.tournaments
     SET commission_snapshot_at = COALESCE(commission_snapshot_at, now())
   WHERE id = p_tournament_id
     AND commission_snapshot_at IS NULL
     AND EXISTS (
       SELECT 1
       FROM public.tournament_commission_snapshots s
       WHERE s.tournament_id = p_tournament_id
     );
END;
$function$;

CREATE OR REPLACE FUNCTION tournament.fn_commission_snapshot_entry(
  p_tournament_id uuid,
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  v_entry              record;
  v_t                  record;
  v_gross              numeric := 0;
  v_rate               numeric := 0;
  v_total_comm         numeric := 0;
  v_agent              uuid;
  v_super              uuid;
  v_admin              uuid;
  v_agent_rate         numeric := 0;
  v_super_rate         numeric := 0;
  v_agent_amount       numeric := 0;
  v_super_amount       numeric := 0;
  v_admin_amount       numeric := 0;
  v_amount_to_pool     numeric := 0;
BEGIN
  SELECT te.id, te.user_id, te.tickets_count, te.status
    INTO v_entry
  FROM public.tournament_entries te
  WHERE te.id = p_entry_id
    AND te.tournament_id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry not found (tournament_id=%, entry_id=%)', p_tournament_id, p_entry_id;
  END IF;

  IF v_entry.status = 'cancelled'::public.tournament_entry_status THEN
    DELETE FROM public.tournament_commission_snapshots
    WHERE tournament_id = p_tournament_id
      AND entry_id      = p_entry_id;
    RETURN;
  END IF;

  SELECT t.id, t.ticket_price, t.currency, t.commission_rate, t.created_by
    INTO v_t
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found: %', p_tournament_id;
  END IF;

  v_admin := v_t.created_by;

  v_rate := COALESCE(v_t.commission_rate, 0);
  IF v_rate > 1 THEN
    v_rate := v_rate / 100.0;
  END IF;

  v_gross := COALESCE(v_entry.tickets_count, 0) * COALESCE(v_t.ticket_price, 0);

  SELECT pa.agent_id, pa.super_id
    INTO v_agent, v_super
  FROM public.player_affiliation pa
  WHERE pa.user_id = v_entry.user_id;

  IF v_agent IS NOT NULL THEN
    SELECT COALESCE(uc.agent_commission, 0)
      INTO v_agent_rate
    FROM public.user_commissions uc
    WHERE uc.user_id = v_agent;

    IF v_agent_rate > 1 THEN
      v_agent_rate := v_agent_rate / 100.0;
    END IF;
  END IF;

  IF v_super IS NOT NULL THEN
    SELECT COALESCE(uc.super_commission, 0)
      INTO v_super_rate
    FROM public.user_commissions uc
    WHERE uc.user_id = v_super;

    IF v_super_rate > 1 THEN
      v_super_rate := v_super_rate / 100.0;
    END IF;
  END IF;

  v_total_comm := CEIL(v_gross * GREATEST(v_rate, 0));

  v_agent_amount := LEAST(
    v_total_comm,
    COALESCE(CEIL(v_total_comm * GREATEST(v_agent_rate, 0)), 0)
  );

  v_super_amount := LEAST(
    GREATEST(v_total_comm - v_agent_amount, 0),
    COALESCE(
      CEIL(v_total_comm * GREATEST(v_super_rate - v_agent_rate, 0)),
      0
    )
  );

  v_admin_amount := GREATEST(v_total_comm - v_agent_amount - v_super_amount, 0);
  v_amount_to_pool := GREATEST(v_gross - v_total_comm, 0);

  INSERT INTO public.tournament_commission_snapshots(
    tournament_id, entry_id, user_id,
    agent_id, super_id, admin_id,
    gross_amount,
    commission_rate,
    commission_base,
    agent_rate, super_rate,
    agent_amount, super_amount, admin_amount,
    amount_to_pool,
    currency,
    commission_model
  ) VALUES (
    p_tournament_id, p_entry_id, v_entry.user_id,
    v_agent, v_super, v_admin,
    v_gross,
    v_rate,
    v_total_comm,
    v_agent_rate, v_super_rate,
    v_agent_amount, v_super_amount, v_admin_amount,
    v_amount_to_pool,
    COALESCE(v_t.currency, 'IRR'),
    'tournament_entry'
  )
  ON CONFLICT (tournament_id, entry_id) DO UPDATE
    SET user_id         = EXCLUDED.user_id,
        agent_id        = EXCLUDED.agent_id,
        super_id        = EXCLUDED.super_id,
        admin_id        = EXCLUDED.admin_id,
        gross_amount    = EXCLUDED.gross_amount,
        commission_rate = EXCLUDED.commission_rate,
        commission_base = EXCLUDED.commission_base,
        agent_rate      = EXCLUDED.agent_rate,
        super_rate      = EXCLUDED.super_rate,
        agent_amount    = EXCLUDED.agent_amount,
        super_amount    = EXCLUDED.super_amount,
        admin_amount    = EXCLUDED.admin_amount,
        amount_to_pool  = EXCLUDED.amount_to_pool,
        currency        = EXCLUDED.currency,
        commission_model= EXCLUDED.commission_model,
        created_at      = now();

  PERFORM tournament.fn_touch_commission_snapshot_at(p_tournament_id);
END;
$function$;

CREATE OR REPLACE FUNCTION tournament.fn_commission_snapshot(
  p_tournament_id uuid,
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public'
AS $function$
BEGIN
  -- Keep legacy name as thin wrapper; entry path is authoritative for trigger.
  PERFORM tournament.fn_commission_snapshot_entry(p_tournament_id, p_entry_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5) Payout: treat settled entries as participating (idempotent re-run safe)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('tournament.fn_payout_tournament(uuid)'::regprocedure)
    INTO v_def;

  v_def := replace(v_def, E'\r\n', E'\n');

  IF position('status IN (''created'', ''settled'')' in v_def) = 0 THEN
    v_def := replace(
      v_def,
      'AND status = ''created''',
      'AND status IN (''created'', ''settled'')'
    );
  END IF;

  EXECUTE v_def;
END $$;

-- ---------------------------------------------------------------------------
-- 6) Finish path: mark entries settled after capture/burn (idempotent)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
  v_marker text := 'P3_1_MARK_ENTRIES_SETTLED';
BEGIN
  SELECT pg_get_functiondef('tournament.fn_manage_tournament_cycle(uuid,bigint)'::regprocedure)
    INTO v_def;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'tournament.fn_manage_tournament_cycle(uuid,bigint) not found';
  END IF;

  v_def := replace(v_def, E'\r\n', E'\n');

  IF position(v_marker in v_def) = 0 THEN
    IF position('PERFORM tournament.fn_capture_entry_locks(p_tournament_id);' in v_def) = 0 THEN
      RAISE EXCEPTION 'expected capture_entry_locks call missing from manage cycle';
    END IF;

    v_def := replace(
      v_def,
      'PERFORM tournament.fn_capture_entry_locks(p_tournament_id);
    ELSE
      PERFORM tournament.fn_burn_ding_locks(p_tournament_id);
    END IF;

    RETURN;',
      'PERFORM tournament.fn_capture_entry_locks(p_tournament_id);
    ELSE
      PERFORM tournament.fn_burn_ding_locks(p_tournament_id);
    END IF;

    -- ' || v_marker || '
    UPDATE public.tournament_entries
       SET status = ''settled''::public.tournament_entry_status
     WHERE tournament_id = p_tournament_id
       AND status = ''created''::public.tournament_entry_status;

    RETURN;'
    );

    IF position(v_marker in v_def) = 0 THEN
      RAISE EXCEPTION 'failed to patch manage_tournament_cycle settle marker';
    END IF;
  END IF;

  EXECUTE v_def;
END $$;

-- ---------------------------------------------------------------------------
-- 7) Safe backfill (metadata only; proven from existing rows)
-- ---------------------------------------------------------------------------

-- 7a) commission_snapshot_at from earliest existing snapshot
UPDATE public.tournaments t
   SET commission_snapshot_at = s.first_at
  FROM (
    SELECT tournament_id, min(created_at) AS first_at
    FROM public.tournament_commission_snapshots
    GROUP BY tournament_id
  ) s
 WHERE t.id = s.tournament_id
   AND t.commission_snapshot_at IS NULL;

-- 7b) captured_amount from entry.amount (preferred) or meta.price*qty
UPDATE public.tournament_locks l
   SET meta = COALESCE(l.meta, '{}'::jsonb) || jsonb_build_object(
     'captured_amount',
     COALESCE(
       NULLIF(e.amount, 0),
       CASE
         WHEN (l.meta ? 'price') THEN
           COALESCE((l.meta->>'price')::numeric, 0)
           * COALESCE(NULLIF(l.meta->>'qty', '')::numeric, 1)
         ELSE NULL
       END
     )
   )
  FROM public.tournament_entries e
 WHERE l.entry_id = e.id
   AND l.lock_kind = 'entry'
   AND l.status = 'captured'
   AND COALESCE(l.amount, 0) = 0
   AND (l.meta->>'captured_amount') IS NULL
   AND COALESCE(
         NULLIF(e.amount, 0),
         CASE
           WHEN (l.meta ? 'price') THEN
             COALESCE((l.meta->>'price')::numeric, 0)
             * COALESCE(NULLIF(l.meta->>'qty', '')::numeric, 1)
           ELSE NULL
         END
       ) IS NOT NULL
   AND COALESCE(
         NULLIF(e.amount, 0),
         CASE
           WHEN (l.meta ? 'price') THEN
             COALESCE((l.meta->>'price')::numeric, 0)
             * COALESCE(NULLIF(l.meta->>'qty', '')::numeric, 1)
           ELSE NULL
         END
       ) > 0;

-- 7c) finished tournament entries: created → settled
UPDATE public.tournament_entries e
   SET status = 'settled'::public.tournament_entry_status
  FROM public.tournaments t
 WHERE e.tournament_id = t.id
   AND t.status = 'finished'::public.tournament_status
   AND e.status = 'created'::public.tournament_entry_status;
