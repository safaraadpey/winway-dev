BEGIN;

-- Fix tournament commission split to use net super share (super - agent),
-- and prevent any over-allocation due to rounding.
CREATE OR REPLACE FUNCTION tournament.fn_commission_snapshot(
  p_tournament_id uuid,
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public'
AS $function$
DECLARE
  v_entry record;
  v_t record;
  v_gross numeric;
  v_rate numeric;
  v_agent_rate numeric := 0;
  v_super_rate numeric := 0;
  v_total_comm numeric := 0;
  v_agent_amount numeric := 0;
  v_super_amount numeric := 0;
  v_admin_amount numeric := 0;
  v_pool_amount numeric := 0;
  v_entry_currency text;
BEGIN
  SELECT te.*, u.id AS user_id
    INTO v_entry
  FROM public.tournament_entries te
  JOIN auth.users u ON u.id = te.user_id
  WHERE te.id = p_entry_id
    AND te.tournament_id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry not found';
  END IF;

  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found';
  END IF;

  v_entry_currency := upper(coalesce(nullif(v_t.meta->>'entry_currency',''), v_t.currency, 'IRR'));
  IF v_entry_currency = 'DING' THEN
    RETURN;
  END IF;

  v_rate := COALESCE(v_t.commission_rate, 0);
  IF v_rate > 1 THEN
    v_rate := v_rate / 100;
  END IF;

  IF v_entry.agent_id IS NOT NULL THEN
    SELECT COALESCE(uc.agent_commission, 0)
      INTO v_agent_rate
    FROM public.user_commissions uc
    WHERE uc.user_id = v_entry.agent_id;

    IF NOT FOUND OR v_agent_rate IS NULL THEN
      v_agent_rate := 0;
    ELSIF v_agent_rate > 1 THEN
      v_agent_rate := v_agent_rate / 100;
    END IF;
  END IF;

  IF v_entry.super_id IS NOT NULL THEN
    SELECT COALESCE(uc.super_commission, 0)
      INTO v_super_rate
    FROM public.user_commissions uc
    WHERE uc.user_id = v_entry.super_id;

    IF NOT FOUND OR v_super_rate IS NULL THEN
      v_super_rate := 0;
    ELSIF v_super_rate > 1 THEN
      v_super_rate := v_super_rate / 100;
    END IF;
  END IF;

  v_gross := COALESCE(v_entry.tickets_count, 0) * COALESCE(v_t.ticket_price, 0);
  v_total_comm := CEIL(v_gross * GREATEST(v_rate, 0));

  -- Agent share from total commission.
  v_agent_amount := LEAST(
    v_total_comm,
    COALESCE(CEIL(v_total_comm * GREATEST(v_agent_rate, 0)), 0)
  );

  -- Super share is NET share (super - agent), capped by remaining commission.
  v_super_amount := LEAST(
    GREATEST(v_total_comm - v_agent_amount, 0),
    COALESCE(
      CEIL(
        v_total_comm * GREATEST(v_super_rate - v_agent_rate, 0)
      ),
      0
    )
  );

  v_admin_amount := GREATEST(v_total_comm - v_agent_amount - v_super_amount, 0);
  v_pool_amount := GREATEST(v_gross - v_total_comm, 0);

  INSERT INTO public.tournament_commission_snapshots(
    tournament_id, entry_id, user_id, agent_id, super_id, admin_id,
    gross_amount, commission_rate, commission_base,
    agent_rate, super_rate, agent_amount, super_amount, admin_amount,
    amount_to_pool, currency, commission_model
  ) VALUES (
    p_tournament_id, p_entry_id, v_entry.user_id, v_entry.agent_id, v_entry.super_id, NULL,
    v_gross, v_rate, v_total_comm,
    v_agent_rate, v_super_rate, v_agent_amount, v_super_amount, v_admin_amount,
    v_pool_amount, COALESCE(v_t.currency, 'IRR'), v_t.commission_model
  )
  ON CONFLICT (tournament_id, entry_id) DO UPDATE
    SET gross_amount    = EXCLUDED.gross_amount,
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
END;
$function$;

-- Fix payout generation: pool should NOT be emitted as tournament_commission payout.
-- Pool is already paid via fn_payout_tournament as tournament_prize.
CREATE OR REPLACE FUNCTION tournament.fn_commission_payout(
  p_tournament_id uuid,
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public'
AS $function$
DECLARE
  v_snap public.tournament_commission_snapshots%ROWTYPE;
  v_admin_id uuid;
BEGIN
  SELECT * INTO v_snap
  FROM public.tournament_commission_snapshots
  WHERE tournament_id = p_tournament_id
    AND entry_id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission snapshot not found';
  END IF;

  IF v_snap.admin_id IS NULL THEN
    SELECT id INTO v_admin_id
    FROM public.users
    WHERE username = 'adminzero'
      AND role = 'admin'
    LIMIT 1;

    IF v_admin_id IS NULL THEN
      RAISE EXCEPTION 'adminzero user not found';
    END IF;
  ELSE
    v_admin_id := v_snap.admin_id;
  END IF;

  DELETE FROM public.tournament_commission_payouts
   WHERE tournament_id = p_tournament_id
     AND entry_id = p_entry_id;

  IF v_snap.admin_amount > 0 AND v_admin_id IS NOT NULL THEN
    INSERT INTO public.tournament_commission_payouts(
      tournament_id, entry_id, beneficiary_user_id, role, amount, currency, status, created_at
    ) VALUES (
      p_tournament_id, p_entry_id, v_admin_id, 'admin', v_snap.admin_amount, v_snap.currency, 'pending', now()
    );
  END IF;

  IF v_snap.agent_amount > 0 AND v_snap.agent_id IS NOT NULL THEN
    INSERT INTO public.tournament_commission_payouts(
      tournament_id, entry_id, beneficiary_user_id, role, amount, currency, status, created_at
    ) VALUES (
      p_tournament_id, p_entry_id, v_snap.agent_id, 'agent', v_snap.agent_amount, v_snap.currency, 'pending', now()
    );
  END IF;

  IF v_snap.super_amount > 0 AND v_snap.super_id IS NOT NULL THEN
    INSERT INTO public.tournament_commission_payouts(
      tournament_id, entry_id, beneficiary_user_id, role, amount, currency, status, created_at
    ) VALUES (
      p_tournament_id, p_entry_id, v_snap.super_id, 'super', v_snap.super_amount, v_snap.currency, 'pending', now()
    );
  END IF;
END;
$function$;

-- Extra guard for legacy rows: never settle pool rows as tournament_commission.
CREATE OR REPLACE FUNCTION tournament.fn_settle_commission_payouts(
  p_tournament_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  r_pay record;
  v_now timestamptz := now();
BEGIN
  FOR r_pay IN
    SELECT id, beneficiary_user_id, amount, currency
    FROM public.tournament_commission_payouts
    WHERE tournament_id = p_tournament_id
      AND status = 'pending'
      AND amount > 0
      AND role IN ('admin', 'agent', 'super')
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM game_finance.fn_wallet_apply_delta(
      p_user_id := r_pay.beneficiary_user_id,
      p_currency := r_pay.currency,
      p_amount_delta := r_pay.amount,
      p_transaction_type := 'win',
      p_source_kind := 'tournament_commission',
      p_source_ref := p_tournament_id::text,
      p_description := 'tournament commission payout',
      p_meta := jsonb_build_object('tournament_id', p_tournament_id, 'payout_id', r_pay.id),
      p_allow_negative := false
    );

    UPDATE public.tournament_commission_payouts
       SET status = 'paid',
           paid_at = v_now
     WHERE id = r_pay.id;
  END LOOP;

  RETURN;
END;
$function$;

COMMIT;
