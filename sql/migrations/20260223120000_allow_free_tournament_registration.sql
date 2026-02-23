-- Allow free tournaments: ticket_price = 0.
-- When amount is 0 we still create/update tournament_entries but skip wallet/DING hold and tournament_locks.
-- Date: 2026-02-23

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

  -- 1) Allow ticket_price = 0 or NULL (reject only negative)
  v_def := regexp_replace(
    v_def,
    'IF v_price IS NULL OR v_price <= 0 THEN',
    'IF v_price IS NOT NULL AND v_price < 0 THEN',
    'g'
  );

  -- 1b) Treat NULL ticket_price as 0 for amount calculation
  v_def := regexp_replace(
    v_def,
    E'v_is_ding := \\(v_entry_currency = ''DING''\\);\n\n  IF v_is_ding THEN',
    E'v_is_ding := (v_entry_currency = ''DING'');\n  v_price := COALESCE(v_price, 0);\n\n  IF v_is_ding THEN',
    'g'
  );

  -- 2) Skip wallet/DING hold and tournament_locks when v_amount = 0 (only patch once)
  IF position('IF v_amount > 0 THEN' in v_def) = 0 THEN
    -- Insert "IF v_amount > 0 THEN" before the DING/wallet block
    v_def := regexp_replace(
      v_def,
      E'  IF v_is_ding THEN\n    SELECT balance, locked_amount',
      E'  IF v_amount > 0 THEN\n  IF v_is_ding THEN\n    SELECT balance, locked_amount',
      'g'
    );
    -- Close the new IF before RETURN v_entry_id
    v_def := regexp_replace(
      v_def,
      E'  RETURN v_entry_id;\nEND;',
      E'  END IF;\n  RETURN v_entry_id;\nEND;',
      'g'
    );
  END IF;

  EXECUTE v_def;
END
$$;
