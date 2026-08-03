-- P6.4: project ledger via balance_after - balance_before (authoritative)
CREATE OR REPLACE FUNCTION game_finance.fn_recon_wallet_ledger(
  p_limit int DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, game_finance
AS $$
DECLARE
  v_drifts jsonb := '[]'::jsonb;
  v_count int := 0;
  v_checked int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT w.user_id, w.currency, w.balance::numeric AS balance,
           coalesce((
             SELECT sum(t.balance_after - t.balance_before)
             FROM public.transactions t
             WHERE t.user_id = w.user_id AND t.currency = w.currency
               AND t.status = 'completed'
               AND t.balance_before IS NOT NULL
               AND t.balance_after IS NOT NULL
           ), 0)::numeric AS projection
    FROM public.wallets w
    WHERE w.currency = 'IRR'
  LOOP
    v_checked := v_checked + 1;
    IF abs(r.balance - r.projection) > 0.009 THEN
      v_count := v_count + 1;
      IF v_count <= p_limit THEN
        v_drifts := v_drifts || jsonb_build_array(jsonb_build_object(
          'user_id', r.user_id,
          'currency', r.currency,
          'balance', r.balance,
          'projection', r.projection,
          'delta', r.balance - r.projection
        ));
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'checked', v_checked,
    'drift_count', v_count,
    'drifts', v_drifts,
    'ok', v_count = 0
  );
END;
$$;
