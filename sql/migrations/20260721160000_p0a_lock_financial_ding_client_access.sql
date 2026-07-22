-- P0-A: Remove anon/authenticated (and PUBLIC) direct access to financial/Ding/settlement
-- primitives. Service role + SECURITY DEFINER entry points (join/cancel/tournament/transfer panel) unchanged.
BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: lock one function to service_role EXECUTE only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.p0a_lock_fn_to_service_role(p_fn regprocedure)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_fn);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', p_fn);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', p_fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', p_fn);
END;
$$;

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    -- Wallet apply / adjust (admin adjust uses service_role; transfer panel uses separate RPC)
    'public.fn_wallet_apply_delta(uuid,text,numeric,transaction_type,text,text,text,jsonb,boolean)'::regprocedure,
    'game_finance.fn_wallet_apply_delta(uuid,text,numeric,transaction_type,text,text,text,jsonb,boolean)'::regprocedure,
    'game_finance.fn_wallet_add(uuid,numeric,text,text,transaction_type,uuid)'::regprocedure,
    'public.fn_adjust_wallet_manual(uuid,numeric,text,transaction_type,text)'::regprocedure,
    'public.fn_adjust_referral_wallet(uuid,numeric,text,transaction_type,text)'::regprocedure,
    -- game_finance wallet primitives (join/cancel use definer wrappers, not direct client RPC)
    'game_finance.fn_wallet_deposit(uuid,numeric,text,text)'::regprocedure,
    'game_finance.fn_wallet_withdraw(uuid,numeric,text,text)'::regprocedure,
    'game_finance.fn_wallet_subtract(uuid,numeric,text,text,transaction_type,uuid)'::regprocedure,
    'game_finance.fn_wallet_capture(uuid,numeric,text,uuid)'::regprocedure,
    'game_finance.fn_wallet_capture_and_distribute(uuid)'::regprocedure,
    'game_finance.fn_wallet_capture_join(uuid,numeric,text,uuid,uuid)'::regprocedure,
    'game_finance.fn_wallet_hold_join(uuid,numeric,text,uuid)'::regprocedure,
    'game_finance.fn_wallet_hold_join(uuid,numeric,text,uuid,uuid)'::regprocedure,
    'game_finance.fn_wallet_release(uuid,numeric,text,uuid)'::regprocedure,
    'game_finance.fn_wallet_release_join(uuid)'::regprocedure,
    'game_finance.fn_wallet_release_join(uuid,numeric,text,uuid)'::regprocedure,
    'game_finance.fn_wallet_release_join(uuid,numeric,text,uuid,uuid)'::regprocedure,
    'game_finance.fn_wallet_summary(uuid,text,timestamp with time zone,uuid)'::regprocedure,
    'game_finance.fn_record_ticket_commission(uuid)'::regprocedure,
    'game_finance.fn_distribute_ticket_commission(uuid,uuid)'::regprocedure,
    'game_finance.fn_payout_room_prize(uuid)'::regprocedure,
    'game_finance.fn_payout_winners(uuid)'::regprocedure,
    -- Settlement / evaluation (game-engine service_role)
    'game_finance.fn_finish_room_and_settle(uuid,uuid)'::regprocedure,
    'public.fn_finish_room_and_settle(uuid,uuid)'::regprocedure,
    'public.fn_evaluate_room_after_draw(uuid,integer)'::regprocedure,
    'game_core.fn_evaluate_room_after_draw(uuid,integer)'::regprocedure,
    'public.fn_payout_room_if_full(uuid)'::regprocedure,
    'public.fn_janitor_repair_unsettled_finished(integer)'::regprocedure,
    -- Ding + engine finalize (game-engine service_role)
    'public.update_ding_balance(uuid,numeric)'::regprocedure,
    'public.rpc_apply_ding_credits_for_draw(uuid,integer,integer,jsonb)'::regprocedure,
    'public.rpc_finalize_engine_draw_job(bigint,uuid,integer,jsonb,jsonb,boolean,integer,jsonb,integer,integer,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,bigint)'::regprocedure
  ] LOOP
    PERFORM pg_temp.p0a_lock_fn_to_service_role(fn);
  END LOOP;
END;
$$;

-- ding_balances: clients may SELECT own row (RLS); no direct DML
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ding_balances FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ding_balances FROM authenticated;

DROP POLICY IF EXISTS "Users can receive realtime ding balance updates" ON public.ding_balances;

COMMIT;
