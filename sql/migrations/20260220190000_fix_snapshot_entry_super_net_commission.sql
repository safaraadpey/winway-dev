BEGIN;

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
  v_rate               numeric := 0;  -- fraction (0..1)
  v_total_comm         numeric := 0;

  v_agent              uuid;
  v_super              uuid;
  v_admin              uuid;

  v_agent_rate         numeric := 0;  -- fraction (0..1)
  v_super_rate         numeric := 0;  -- fraction (0..1)

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
END;
$function$;

COMMIT;
