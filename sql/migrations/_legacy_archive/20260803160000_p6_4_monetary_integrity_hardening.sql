-- P6.4 — Monetary integrity hardening
-- Transfer idempotency, apply_delta optional idempotency_key, recon helpers
-- Does NOT implement Deposit Domain / payment gateway / game logic changes

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Transfer idempotency registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_transfer_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  client_request_id text NOT NULL,
  payload_hash text NOT NULL,
  transfer_id uuid NOT NULL,
  target_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  action text NOT NULL CHECK (lower(action) IN ('deposit', 'withdraw')),
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_transfer_idempotency_actor_req_uidx
    UNIQUE (actor_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS wallet_transfer_idempotency_transfer_id_idx
  ON public.wallet_transfer_idempotency (transfer_id);

COMMENT ON TABLE public.wallet_transfer_idempotency IS
  'P6.4: panel transfer exactly-once by (actor_id, client_request_id).';

ALTER TABLE public.wallet_transfer_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transfer_idempotency FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wallet_transfer_idempotency FROM PUBLIC;
REVOKE ALL ON TABLE public.wallet_transfer_idempotency FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.wallet_transfer_idempotency TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Recon report storage
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_recon_reports (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('wallet_ledger', 'money_conservation', 'combined')),
  status text NOT NULL CHECK (status IN ('ok', 'drift', 'error')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_recon_reports_created_idx
  ON public.finance_recon_reports (created_at DESC);

ALTER TABLE public.finance_recon_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_recon_reports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.finance_recon_reports FROM PUBLIC;
REVOKE ALL ON TABLE public.finance_recon_reports FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.finance_recon_reports TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.finance_recon_reports_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- 3) apply_delta with optional idempotency_key
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_wallet_apply_delta(
  uuid, text, numeric, transaction_type, text, text, text, jsonb, boolean
);
DROP FUNCTION IF EXISTS game_finance.fn_wallet_apply_delta(
  uuid, text, numeric, transaction_type, text, text, text, jsonb, boolean
);

CREATE OR REPLACE FUNCTION game_finance.fn_wallet_apply_delta(
  p_user_id uuid,
  p_currency text,
  p_amount_delta numeric,
  p_transaction_type transaction_type,
  p_source_kind text,
  p_source_ref text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_allow_negative boolean DEFAULT false,
  p_idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, game_finance
AS $function$
DECLARE
  v_wallet_id uuid;
  v_wallet_balance numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_transaction_id uuid;
  v_room_id uuid;
  v_ticket_id uuid;
  v_existing record;
  v_existing_delta numeric;
  v_key text;
BEGIN
  v_key := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');

  IF p_amount_delta = 0 THEN
    RAISE EXCEPTION 'zero amount not allowed';
  END IF;

  -- Serialize duplicate keys within a transaction (and across backends via advisory lock)
  IF v_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));
    SELECT t.id, t.user_id, t.balance_before, t.balance_after, t.type, t.currency
      INTO v_existing
    FROM public.transactions t
    WHERE t.idempotency_key = v_key
    LIMIT 1;
    IF FOUND THEN
      v_existing_delta := (v_existing.balance_after - v_existing.balance_before);
      IF v_existing.user_id IS DISTINCT FROM p_user_id
         OR v_existing.currency IS DISTINCT FROM p_currency
         OR v_existing_delta IS DISTINCT FROM p_amount_delta
         OR v_existing.type IS DISTINCT FROM p_transaction_type THEN
        RAISE EXCEPTION 'idempotency_payload_mismatch'
          USING ERRCODE = '22023';
      END IF;
      RETURN v_existing.id;
    END IF;
  END IF;

  SELECT id, balance INTO v_wallet_id, v_wallet_balance
  FROM public.wallets
  WHERE user_id = p_user_id AND currency = p_currency
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
    VALUES (p_user_id, p_currency, 0, 0, now(), now())
    RETURNING id, balance INTO v_wallet_id, v_wallet_balance;
  END IF;

  v_balance_before := v_wallet_balance;
  v_balance_after := v_balance_before + p_amount_delta;

  IF NOT p_allow_negative AND v_balance_after < 0 THEN
    RAISE EXCEPTION 'insufficient funds: balance would be %', v_balance_after;
  END IF;

  v_room_id := NULL;
  v_ticket_id := NULL;
  IF p_meta IS NOT NULL THEN
    IF p_meta ? 'room_id' THEN
      v_room_id := (p_meta->>'room_id')::uuid;
    END IF;
    IF p_meta ? 'ticket_id' THEN
      v_ticket_id := (p_meta->>'ticket_id')::uuid;
    END IF;
  END IF;

  UPDATE public.wallets
  SET balance = v_balance_after,
      updated_at = now()
  WHERE id = v_wallet_id;

  INSERT INTO public.transactions (
    id, wallet_id, user_id, type, status, amount, currency, description,
    balance_before, balance_after, source_kind, source_ref, room_id, ticket_id,
    idempotency_key, created_at
  ) VALUES (
    gen_random_uuid(), v_wallet_id, p_user_id, p_transaction_type, 'completed',
    ABS(p_amount_delta), p_currency, COALESCE(p_description, 'wallet adjustment'),
    v_balance_before, v_balance_after, p_source_kind, p_source_ref, v_room_id, v_ticket_id,
    v_key, now()
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_wallet_apply_delta(
  p_user_id uuid,
  p_currency text,
  p_amount_delta numeric,
  p_transaction_type transaction_type,
  p_source_kind text,
  p_source_ref text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_allow_negative boolean DEFAULT false,
  p_idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, game_finance
AS $function$
  SELECT game_finance.fn_wallet_apply_delta(
    p_user_id, p_currency, p_amount_delta, p_transaction_type, p_source_kind,
    p_source_ref, p_description, p_meta, p_allow_negative, p_idempotency_key
  );
$function$;

REVOKE ALL ON FUNCTION game_finance.fn_wallet_apply_delta(
  uuid, text, numeric, transaction_type, text, text, text, jsonb, boolean, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_wallet_apply_delta(
  uuid, text, numeric, transaction_type, text, text, text, jsonb, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION game_finance.fn_wallet_apply_delta(
  uuid, text, numeric, transaction_type, text, text, text, jsonb, boolean, text
) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_wallet_apply_delta(
  uuid, text, numeric, transaction_type, text, text, text, jsonb, boolean, text
) TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 4) Transfer panel with mandatory client_request_id
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_wallet_transfer_panel(uuid, bigint, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.fn_wallet_transfer_panel(
  p_target_id uuid,
  p_amount bigint,
  p_action text,
  p_client_request_id text,
  p_description text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS table(
  transfer_id uuid,
  actor_id uuid,
  from_user_id uuid,
  to_user_id uuid,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor        uuid := auth.uid();
  v_actor_role   public.users.role%type;
  v_target_role  public.users.role%type;
  v_from_user_id uuid;
  v_to_user_id   uuid;
  v_transfer_id  uuid := gen_random_uuid();
  rec record;
  v_from_wallet_id uuid;
  v_to_wallet_id   uuid;
  v_from_before bigint;
  v_to_before   bigint;
  v_from_after  bigint;
  v_to_after    bigint;
  v_desc_out text;
  v_desc_in  text;
  v_req text;
  v_payload_hash text;
  v_existing public.wallet_transfer_idempotency%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_req := NULLIF(btrim(COALESCE(p_client_request_id, '')), '');
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'client_request_id_required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  IF p_target_id IS NULL THEN
    RAISE EXCEPTION 'target_id is required';
  END IF;

  IF v_actor = p_target_id THEN
    RAISE EXCEPTION 'cannot transfer to self';
  END IF;

  v_payload_hash := md5(
    p_target_id::text || '|' || p_amount::text || '|' || lower(p_action)
  );

  -- Serialize per actor+request
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_actor::text || ':' || v_req, 0)
  );

  SELECT i.id, i.actor_id, i.client_request_id, i.payload_hash, i.transfer_id,
         i.target_id, i.amount, i.action, i.from_user_id, i.to_user_id, i.created_at
    INTO v_existing
  FROM public.wallet_transfer_idempotency i
  WHERE i.actor_id = v_actor AND i.client_request_id = v_req;

  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_payload_mismatch'
        USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
      SELECT v_existing.transfer_id, v_actor, v_existing.from_user_id,
             v_existing.to_user_id, true;
    RETURN;
  END IF;

  SELECT u.role INTO v_actor_role FROM public.users u WHERE u.id = v_actor;
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_actor_role NOT IN ('admin','super','agent') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT u.role INTO v_target_role FROM public.users u WHERE u.id = p_target_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;

  IF v_actor_role = 'admin' THEN
    NULL;
  ELSIF v_actor_role = 'super' THEN
    IF v_target_role = 'agent' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.users a
        WHERE a.id = p_target_id AND a.role = 'agent' AND a.parent_id = v_actor
      ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    ELSIF v_target_role = 'player' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.player_affiliation pa
        WHERE pa.user_id = p_target_id AND pa.super_id = v_actor
      ) AND NOT EXISTS (
        SELECT 1 FROM public.users p
        WHERE p.id = p_target_id AND p.role = 'player' AND p.parent_id = v_actor
      ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    ELSE
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  ELSIF v_actor_role = 'agent' THEN
    IF v_target_role = 'player' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.player_affiliation pa
        WHERE pa.user_id = p_target_id AND pa.agent_id = v_actor
      ) AND NOT EXISTS (
        SELECT 1 FROM public.users p
        WHERE p.id = p_target_id AND p.role = 'player' AND p.parent_id = v_actor
      ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    ELSIF v_target_role = 'agent' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.users a
        WHERE a.id = p_target_id AND a.role = 'agent' AND a.parent_id = v_actor
      ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    ELSE
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  END IF;

  IF lower(p_action) = 'deposit' THEN
    v_from_user_id := v_actor;
    v_to_user_id := p_target_id;
  ELSIF lower(p_action) = 'withdraw' THEN
    v_from_user_id := p_target_id;
    v_to_user_id := v_actor;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;

  INSERT INTO public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
  VALUES (v_from_user_id, 'IRR', 0, 0, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
  VALUES (v_to_user_id, 'IRR', 0, 0, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  FOR rec IN
    SELECT id, user_id, balance, currency
    FROM public.wallets
    WHERE user_id IN (v_from_user_id, v_to_user_id)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF rec.currency <> 'IRR' THEN
      RAISE EXCEPTION 'wallet currency mismatch for user %', rec.user_id;
    END IF;
    IF rec.user_id = v_from_user_id THEN
      v_from_wallet_id := rec.id;
      v_from_before := rec.balance;
    ELSIF rec.user_id = v_to_user_id THEN
      v_to_wallet_id := rec.id;
      v_to_before := rec.balance;
    END IF;
  END LOOP;

  IF v_from_wallet_id IS NULL OR v_to_wallet_id IS NULL THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  v_from_after := v_from_before - p_amount;
  IF v_from_after < 0 THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;
  v_to_after := v_to_before + p_amount;

  UPDATE public.wallets SET balance = v_from_after, updated_at = now()
  WHERE id = v_from_wallet_id;
  UPDATE public.wallets SET balance = v_to_after, updated_at = now()
  WHERE id = v_to_wallet_id;

  v_desc_out := coalesce(p_description, 'panel transfer');
  v_desc_in  := coalesce(p_description, 'panel transfer');

  INSERT INTO public.transactions (
    id, wallet_id, user_id, type, status, amount, currency, description,
    balance_before, balance_after, source_kind, source_ref, meta, created_at
  ) VALUES (
    gen_random_uuid(), v_from_wallet_id, v_from_user_id,
    'transfer_out'::public.transaction_type, 'completed'::public.transaction_status,
    p_amount, 'IRR', v_desc_out, v_from_before, v_from_after,
    'admin_panel_transfer', v_transfer_id::text,
    jsonb_build_object(
      'transfer_id', v_transfer_id, 'actor_id', v_actor,
      'target_id', p_target_id, 'action', lower(p_action),
      'client_request_id', v_req
    ) || coalesce(p_meta, '{}'::jsonb),
    now()
  );

  INSERT INTO public.transactions (
    id, wallet_id, user_id, type, status, amount, currency, description,
    balance_before, balance_after, source_kind, source_ref, meta, created_at
  ) VALUES (
    gen_random_uuid(), v_to_wallet_id, v_to_user_id,
    'transfer_in'::public.transaction_type, 'completed'::public.transaction_status,
    p_amount, 'IRR', v_desc_in, v_to_before, v_to_after,
    'admin_panel_transfer', v_transfer_id::text,
    jsonb_build_object(
      'transfer_id', v_transfer_id, 'actor_id', v_actor,
      'target_id', p_target_id, 'action', lower(p_action),
      'client_request_id', v_req
    ) || coalesce(p_meta, '{}'::jsonb),
    now()
  );

  INSERT INTO public.wallet_transfer_idempotency (
    actor_id, client_request_id, payload_hash, transfer_id, target_id,
    amount, action, from_user_id, to_user_id
  ) VALUES (
    v_actor, v_req, v_payload_hash, v_transfer_id, p_target_id,
    p_amount, lower(p_action), v_from_user_id, v_to_user_id
  );

  RETURN QUERY
    SELECT v_transfer_id, v_actor, v_from_user_id, v_to_user_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_wallet_transfer_panel(uuid, bigint, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_wallet_transfer_panel(uuid, bigint, text, text, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Ledger projection helper + recon functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION game_finance.fn_ledger_signed_amount(
  p_type public.transaction_type,
  p_amount numeric
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_type::text IN (
      'deposit', 'win', 'refund', 'adjustment',
      'fee_admin', 'fee_agent', 'fee_super',
      'join_refund', 'transfer_in'
    ) THEN p_amount
    WHEN p_type::text IN (
      'withdraw', 'bet', 'join', 'join_hold', 'transfer_out', 'join_capture'
    ) THEN -p_amount
    ELSE 0
  END;
$$;

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

CREATE OR REPLACE FUNCTION game_finance.fn_recon_money_conservation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, game_finance
AS $$
DECLARE
  v_transfer_in numeric;
  v_transfer_out numeric;
  v_manual_deposit numeric;
  v_manual_withdraw numeric;
  v_join_hold numeric;
  v_join_refund numeric;
  v_fees numeric;
  v_wins numeric;
  v_balance_sum numeric;
  v_locked_sum numeric;
BEGIN
  SELECT coalesce(sum(amount),0) INTO v_transfer_in
  FROM public.transactions WHERE type = 'transfer_in' AND status = 'completed';
  SELECT coalesce(sum(amount),0) INTO v_transfer_out
  FROM public.transactions WHERE type = 'transfer_out' AND status = 'completed';

  SELECT coalesce(sum(amount),0) INTO v_manual_deposit
  FROM public.transactions
  WHERE type = 'deposit' AND source_kind = 'manual_panel' AND status = 'completed';
  SELECT coalesce(sum(amount),0) INTO v_manual_withdraw
  FROM public.transactions
  WHERE type = 'withdraw' AND source_kind = 'manual_panel' AND status = 'completed';

  SELECT coalesce(sum(amount),0) INTO v_join_hold
  FROM public.transactions WHERE type = 'join_hold' AND status = 'completed';
  SELECT coalesce(sum(amount),0) INTO v_join_refund
  FROM public.transactions WHERE type = 'join_refund' AND status = 'completed';

  SELECT coalesce(sum(amount),0) INTO v_fees
  FROM public.transactions
  WHERE type IN ('fee_admin','fee_agent','fee_super') AND status = 'completed';
  SELECT coalesce(sum(amount),0) INTO v_wins
  FROM public.transactions WHERE type = 'win' AND status = 'completed';

  SELECT coalesce(sum(balance),0), coalesce(sum(locked_amount),0)
    INTO v_balance_sum, v_locked_sum
  FROM public.wallets WHERE currency = 'IRR';

  RETURN jsonb_build_object(
    'transfers', jsonb_build_object(
      'transfer_in', v_transfer_in,
      'transfer_out', v_transfer_out,
      'net', v_transfer_in - v_transfer_out,
      'ok', abs(v_transfer_in - v_transfer_out) < 0.009
    ),
    'treasury_injection', jsonb_build_object(
      'manual_panel_deposit', v_manual_deposit,
      'manual_panel_withdraw', v_manual_withdraw,
      'net_injection', v_manual_deposit - v_manual_withdraw
    ),
    'game_cycle', jsonb_build_object(
      'join_hold', v_join_hold,
      'join_refund', v_join_refund,
      'net_captured_approx', v_join_hold - v_join_refund,
      'fees_reminted', v_fees,
      'wins_reminted', v_wins,
      'fees_plus_wins', v_fees + v_wins,
      'note', 'Room capture has no ledger row; compare hold-refund vs fees+wins as approximation. Tournament guarantee is included in wins when paid.'
    ),
    'liability', jsonb_build_object(
      'balance_sum', v_balance_sum,
      'locked_sum', v_locked_sum,
      'liability', v_balance_sum + v_locked_sum
    ),
    'ok', abs(v_transfer_in - v_transfer_out) < 0.009
  );
END;
$$;

CREATE OR REPLACE FUNCTION game_finance.fn_recon_run_and_store()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, game_finance
AS $$
DECLARE
  v_wl jsonb;
  v_mc jsonb;
  v_status text;
  v_id bigint;
BEGIN
  v_wl := game_finance.fn_recon_wallet_ledger(200);
  v_mc := game_finance.fn_recon_money_conservation();
  v_status := CASE
    WHEN (v_wl->>'ok')::boolean AND (v_mc->>'ok')::boolean THEN 'ok'
    ELSE 'drift'
  END;

  INSERT INTO public.finance_recon_reports (kind, status, summary, details)
  VALUES (
    'combined',
    v_status,
    jsonb_build_object(
      'wallet_ledger_ok', (v_wl->>'ok')::boolean,
      'conservation_ok', (v_mc->>'ok')::boolean,
      'drift_count', (v_wl->>'drift_count')::int
    ),
    jsonb_build_object('wallet_ledger', v_wl, 'money_conservation', v_mc)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'report_id', v_id,
    'status', v_status,
    'wallet_ledger', v_wl,
    'money_conservation', v_mc
  );
END;
$$;

REVOKE ALL ON FUNCTION game_finance.fn_ledger_signed_amount(transaction_type, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_finance.fn_recon_wallet_ledger(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_finance.fn_recon_money_conservation() FROM PUBLIC;
REVOKE ALL ON FUNCTION game_finance.fn_recon_run_and_store() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION game_finance.fn_recon_wallet_ledger(int) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION game_finance.fn_recon_money_conservation() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION game_finance.fn_recon_run_and_store() TO postgres, service_role;

-- Public wrappers for PostgREST / service_role RPC
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

COMMIT;
