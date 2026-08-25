-- Auto-buy profit_target is net profit (سقف برد), not an absolute fund ceiling.
-- Example: fund 100000 + profit 25000 → stop when fund_remaining >= 125000.

BEGIN;

ALTER TABLE public.player_auto_buy_sessions
  DROP CONSTRAINT IF EXISTS player_auto_buy_profit_target_gt_fund;

-- Convert legacy absolute ceilings (profit_target > fund_initial) to net profit.
UPDATE public.player_auto_buy_sessions
   SET profit_target = profit_target - fund_initial,
       updated_at = now()
 WHERE profit_target > fund_initial;

ALTER TABLE public.player_auto_buy_sessions
  ADD CONSTRAINT player_auto_buy_profit_target_positive
  CHECK (profit_target > 0);

DO $$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('game_core', 'fn_auto_buy_try_join'),
      ('public', 'fn_auto_buy_recover_due'),
      ('public', 'fn_auto_buy_after_room_finished'),
      ('public', 'fn_player_auto_buy_start')
    )
  LOOP
    v_def := r.def;
    v_def := replace(
      v_def,
      'fund_remaining >= v_session.profit_target',
      'fund_remaining >= (v_session.fund_initial + v_session.profit_target)'
    );
    v_def := replace(
      v_def,
      'fund_remaining >= r_session.profit_target',
      'fund_remaining >= (r_session.fund_initial + r_session.profit_target)'
    );
    v_def := replace(
      v_def,
      'SELECT fund_remaining, profit_target, card_count, template_id
        INTO r_session.fund_remaining, r_session.profit_target, r_session.card_count, r_session.template_id',
      'SELECT fund_remaining, fund_initial, profit_target, card_count, template_id
        INTO r_session.fund_remaining, r_session.fund_initial, r_session.profit_target, r_session.card_count, r_session.template_id'
    );
    v_def := replace(
      v_def,
      'IF p_profit_target IS NULL OR p_profit_target <= p_fund THEN
    RAISE EXCEPTION ''profit target must exceed fund'';',
      'IF p_profit_target IS NULL OR p_profit_target <= 0 THEN
    RAISE EXCEPTION ''profit target must be positive'';'
    );
    EXECUTE v_def;
  END LOOP;
END;
$$;

COMMIT;
