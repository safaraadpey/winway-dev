-- HamiPay deposit: additive columns + allow created→failed
ALTER TABLE deposit.intents
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS payment_url text,
  ADD COLUMN IF NOT EXISTS merchant_order_id text;

ALTER TABLE deposit.intents
  DROP CONSTRAINT IF EXISTS deposit_intents_environment_check;

ALTER TABLE deposit.intents
  ADD CONSTRAINT deposit_intents_environment_check
  CHECK (
    environment IS NULL
    OR environment IN ('development', 'production')
  );

CREATE OR REPLACE FUNCTION deposit.fn_assert_transition(
  p_from deposit.intent_status,
  p_to deposit.intent_status
) RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF NOT (
    (p_from = 'created' AND p_to IN ('pending', 'expired', 'failed'))
    OR (p_from = 'pending' AND p_to IN ('observed', 'expired', 'rejected'))
    OR (p_from = 'observed' AND p_to IN ('verifying', 'expired'))
    OR (p_from = 'verifying' AND p_to IN ('confirmed', 'rejected', 'observed'))
    OR (p_from = 'confirmed' AND p_to IN ('credited', 'failed'))
    OR (p_from = 'credited' AND p_to = 'reversed')
  ) THEN
    RAISE EXCEPTION 'deposit_forbidden_transition:%->%', p_from, p_to
      USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION deposit.fn_mark_create_failed(
  p_intent_id uuid,
  p_error text DEFAULT 'failed_to_create'
) RETURNS deposit.intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public
AS $$
DECLARE
  v_row deposit.intents%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM deposit.intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_found'; END IF;

  IF v_row.status = 'failed' THEN
    RETURN v_row;
  END IF;

  IF v_row.status <> 'created' THEN
    RAISE EXCEPTION 'deposit_forbidden_transition:%->failed', v_row.status
      USING ERRCODE = '22023';
  END IF;

  PERFORM deposit.fn_assert_transition(v_row.status, 'failed');

  UPDATE deposit.intents
  SET status = 'failed',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'create_failed', true,
        'create_error', left(coalesce(p_error, 'failed_to_create'), 500)
      )
  WHERE id = p_intent_id
  RETURNING * INTO v_row;

  PERFORM deposit.fn_append_event(
    p_intent_id,
    'intent.create_failed',
    'system',
    jsonb_build_object('error', left(coalesce(p_error, 'failed_to_create'), 500))
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION deposit.fn_mark_create_failed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deposit.fn_mark_create_failed(uuid, text) TO postgres, service_role;

COMMENT ON COLUMN deposit.intents.environment IS 'HamiPay / gateway environment isolation: development|production';
COMMENT ON COLUMN deposit.intents.payment_url IS 'Provider checkout URL; never treat as proof of payment';
COMMENT ON COLUMN deposit.intents.merchant_order_id IS 'Merchant order id sent to provider (usually intent id)';
