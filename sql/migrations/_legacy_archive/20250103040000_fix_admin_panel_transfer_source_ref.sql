BEGIN;

-- Ensure source_ref points to the counterparty user_id for admin panel transfers.
-- This makes joins to users possible and avoids "نامشخص" in history views.

CREATE OR REPLACE FUNCTION public.fn_wallet_transfer_panel(
  p_target_id uuid,
  p_amount bigint,
  p_action text,
  p_description text default null,
  p_meta jsonb default '{}'::jsonb
)
RETURNS TABLE(
  transfer_id uuid,
  actor_id uuid,
  from_user_id uuid,
  to_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
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

  SELECT u.role INTO v_actor_role
  FROM public.users u
  WHERE u.id = v_actor;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF v_actor_role NOT IN ('admin','super','agent') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT u.role INTO v_target_role
  FROM public.users u
  WHERE u.id = p_target_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;

  -- Hierarchical authorization enforced in DB
  IF v_actor_role = 'admin' THEN
    NULL;
  ELSIF v_actor_role = 'super' THEN
    IF v_target_role = 'agent' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.users a
        WHERE a.id = p_target_id
          AND a.role = 'agent'
          AND a.parent_id = v_actor
      ) THEN
        RAISE EXCEPTION 'FORBIDDEN';
      END IF;
    ELSIF v_target_role = 'player' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.player_affiliation pa
        WHERE pa.user_id = p_target_id
          AND pa.super_id = v_actor
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.users p
        WHERE p.id = p_target_id
          AND p.role = 'player'
          AND p.parent_id = v_actor
      ) THEN
        RAISE EXCEPTION 'FORBIDDEN';
      END IF;
    ELSE
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  ELSIF v_actor_role = 'agent' THEN
    IF v_target_role <> 'player' THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.player_affiliation pa
      WHERE pa.user_id = p_target_id
        AND pa.agent_id = v_actor
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.users p
      WHERE p.id = p_target_id
        AND p.role = 'player'
        AND p.parent_id = v_actor
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  END IF;

  -- Direction mapping (UI uses deposit/withdraw, ledger uses transfer_in/transfer_out)
  IF lower(p_action) = 'deposit' THEN
    v_from_user_id := v_actor;
    v_to_user_id := p_target_id;
  ELSIF lower(p_action) = 'withdraw' THEN
    v_from_user_id := p_target_id;
    v_to_user_id := v_actor;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;

  -- Ensure wallets exist
  INSERT INTO public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
  VALUES (v_from_user_id, 'IRR', 0, 0, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
  VALUES (v_to_user_id, 'IRR', 0, 0, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  -- Deterministic locking by wallet_id to avoid deadlocks
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

  -- Update balances (two-sided, atomic)
  UPDATE public.wallets
  SET balance = v_from_after,
      updated_at = now()
  WHERE id = v_from_wallet_id;

  UPDATE public.wallets
  SET balance = v_to_after,
      updated_at = now()
  WHERE id = v_to_wallet_id;

  v_desc_out := coalesce(p_description, 'panel transfer');
  v_desc_in  := coalesce(p_description, 'panel transfer');

  -- Ledger entries (two rows, shared transfer_id via meta)
  INSERT INTO public.transactions (
    id, wallet_id, user_id,
    type, status,
    amount, currency,
    description,
    balance_before, balance_after,
    source_kind, source_ref,
    meta,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_from_wallet_id,
    v_from_user_id,
    'transfer_out'::public.transaction_type,
    'completed'::public.transaction_status,
    p_amount,
    'IRR',
    v_desc_out,
    v_from_before,
    v_from_after,
    'admin_panel_transfer',
    v_to_user_id::text,
    jsonb_build_object(
      'transfer_id', v_transfer_id,
      'actor_id', v_actor,
      'target_id', p_target_id,
      'action', lower(p_action)
    ) || coalesce(p_meta, '{}'::jsonb),
    now()
  );

  INSERT INTO public.transactions (
    id, wallet_id, user_id,
    type, status,
    amount, currency,
    description,
    balance_before, balance_after,
    source_kind, source_ref,
    meta,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_to_wallet_id,
    v_to_user_id,
    'transfer_in'::public.transaction_type,
    'completed'::public.transaction_status,
    p_amount,
    'IRR',
    v_desc_in,
    v_to_before,
    v_to_after,
    'admin_panel_transfer',
    v_from_user_id::text,
    jsonb_build_object(
      'transfer_id', v_transfer_id,
      'actor_id', v_actor,
      'target_id', p_target_id,
      'action', lower(p_action)
    ) || coalesce(p_meta, '{}'::jsonb),
    now()
  );

  RETURN QUERY
    SELECT v_transfer_id, v_actor, v_from_user_id, v_to_user_id;
END;
$function$;

-- Backfill existing admin_panel_transfer rows: set source_ref to the counterparty user id.
-- Disable updated_at trigger since transactions table doesn't have updated_at.
ALTER TABLE public.transactions DISABLE TRIGGER trg_set_updated_at_transactions;

UPDATE public.transactions
SET source_ref = CASE
  WHEN type = 'transfer_out' THEN (meta->>'target_id')
  WHEN type = 'transfer_in' THEN (meta->>'actor_id')
  ELSE source_ref
END
WHERE source_kind = 'admin_panel_transfer'
  AND meta ? 'actor_id'
  AND meta ? 'target_id'
  AND source_ref IS DISTINCT FROM CASE
    WHEN type = 'transfer_out' THEN (meta->>'target_id')
    WHEN type = 'transfer_in' THEN (meta->>'actor_id')
    ELSE source_ref
  END;

ALTER TABLE public.transactions ENABLE TRIGGER trg_set_updated_at_transactions;

COMMIT;

