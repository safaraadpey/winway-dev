-- P6.4 hotfix: ambiguous actor_id in transfer idempotency lookup
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
