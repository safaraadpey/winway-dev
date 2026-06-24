-- Dev Panel: aggregate finance stats for configured dev players.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_dev_panel_dev_player_finance_summary(
  p_period text,
  p_timezone text DEFAULT 'Asia/Tehran'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz := now();
  v_tz text := COALESCE(NULLIF(trim(p_timezone), ''), 'Asia/Tehran');
  v_cards bigint := 0;
  v_purchase numeric := 0;
  v_win numeric := 0;
  v_commission numeric := 0;
  v_loss numeric := 0;
  v_dev_count bigint := 0;
BEGIN
  IF p_period NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'invalid period: %', p_period;
  END IF;

  IF p_period = 'day' THEN
    v_from := (date_trunc('day', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  ELSIF p_period = 'week' THEN
    v_from := v_to - interval '7 days';
  ELSE
    v_from := (date_trunc('month', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  END IF;

  SELECT COUNT(DISTINCT dpc.user_id)
    INTO v_dev_count
  FROM public.dev_player_configs dpc;

  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(tk.price), 0)
  INTO v_cards, v_purchase
  FROM public.tickets tk
  INNER JOIN public.dev_player_configs dpc ON dpc.user_id = tk.player_user_id
  WHERE tk.reservation_status IN ('consumed', 'confirmed')
    AND tk.created_at >= v_from
    AND tk.created_at < v_to;

  SELECT COALESCE(SUM(t.amount), 0)
    INTO v_win
  FROM public.transactions t
  INNER JOIN public.dev_player_configs dpc ON dpc.user_id = t.user_id
  WHERE t.type = 'win'::public.transaction_type
    AND t.created_at >= v_from
    AND t.created_at < v_to;

  SELECT COALESCE(SUM(cl.commission_base), 0)
    INTO v_commission
  FROM public.commissions_log cl
  INNER JOIN public.dev_player_configs dpc ON dpc.user_id = cl.player_id
  WHERE cl.created_at >= v_from
    AND cl.created_at < v_to;

  v_loss := GREATEST(v_purchase - v_win, 0);

  RETURN jsonb_build_object(
    'period', p_period,
    'timezone', v_tz,
    'from', v_from,
    'to', v_to,
    'dev_player_count', v_dev_count,
    'cards_purchased', v_cards,
    'total_purchase_amount', v_purchase,
    'total_win_amount', v_win,
    'total_commission_amount', v_commission,
    'total_loss_amount', v_loss,
    'currency', 'IRR'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_dev_panel_dev_player_finance_summary(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dev_panel_dev_player_finance_summary(text, text) TO service_role;

COMMIT;
