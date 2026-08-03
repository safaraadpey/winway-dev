-- P6.4 follow-up: public wrappers for recon RPCs (PostgREST)
CREATE OR REPLACE FUNCTION public.fn_recon_run_and_store()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, game_finance
AS $$
  SELECT game_finance.fn_recon_run_and_store();
$$;

CREATE OR REPLACE FUNCTION public.fn_recon_wallet_ledger(p_limit int DEFAULT 500)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, game_finance
AS $$
  SELECT game_finance.fn_recon_wallet_ledger(p_limit);
$$;

CREATE OR REPLACE FUNCTION public.fn_recon_money_conservation()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, game_finance
AS $$
  SELECT game_finance.fn_recon_money_conservation();
$$;

REVOKE ALL ON FUNCTION public.fn_recon_run_and_store() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_recon_wallet_ledger(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_recon_money_conservation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_recon_run_and_store() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_recon_wallet_ledger(int) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_recon_money_conservation() TO postgres, service_role;
