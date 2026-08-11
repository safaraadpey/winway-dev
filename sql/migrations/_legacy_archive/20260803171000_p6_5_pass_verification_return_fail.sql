-- P6.5: pass_verification returns fail result (commits reject) instead of RAISE rollback
CREATE OR REPLACE FUNCTION deposit.fn_pass_verification(
  p_intent_id uuid,
  p_attempt_id uuid,
  p_provider text,
  p_external_payment_id text,
  p_amount_observed numeric,
  p_currency_observed text,
  p_evidence jsonb DEFAULT '{}'::jsonb,
  p_confirmations int DEFAULT NULL,
  p_destination_observed text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public
AS $$
DECLARE
  v_intent deposit.intents%ROWTYPE;
  v_verification_id uuid;
  v_dest text;
  v_fail_code text;
BEGIN
  SELECT * INTO v_intent FROM deposit.intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_found'; END IF;

  IF v_intent.status <> 'verifying' THEN
    RAISE EXCEPTION 'deposit_forbidden_transition:%->confirmed', v_intent.status
      USING ERRCODE = '22023';
  END IF;

  IF p_external_payment_id IS NULL OR btrim(p_external_payment_id) = '' THEN
    RAISE EXCEPTION 'external_payment_id_required';
  END IF;

  v_fail_code := NULL;
  IF v_intent.expires_at <= now() THEN
    v_fail_code := 'expired';
  ELSIF p_amount_observed IS DISTINCT FROM v_intent.amount_expected THEN
    v_fail_code := 'amount_mismatch';
  ELSIF upper(coalesce(p_currency_observed, '')) IS DISTINCT FROM upper(v_intent.currency) THEN
    v_fail_code := 'currency_mismatch';
  ELSE
    v_dest := coalesce(p_destination_observed, '');
    IF v_intent.destination_ref IS NOT NULL
       AND v_dest <> ''
       AND v_dest IS DISTINCT FROM v_intent.destination_ref THEN
      v_fail_code := 'wrong_destination';
    END IF;
  END IF;

  IF v_fail_code IS NOT NULL THEN
    INSERT INTO deposit.verifications (
      intent_id, attempt_id, provider, result, failure_code, evidence,
      external_payment_id, amount_observed, currency_observed, confirmations
    ) VALUES (
      p_intent_id, p_attempt_id, p_provider, 'fail', v_fail_code, coalesce(p_evidence, '{}'::jsonb),
      p_external_payment_id, p_amount_observed, p_currency_observed, p_confirmations
    )
    RETURNING id INTO v_verification_id;

    PERFORM deposit.fn_assert_transition('verifying', 'rejected');
    UPDATE deposit.intents SET status = 'rejected' WHERE id = p_intent_id;
    PERFORM deposit.fn_append_event(p_intent_id, 'verification.failed', 'system',
      jsonb_build_object('failure_code', v_fail_code, 'verification_id', v_verification_id));

    RETURN jsonb_build_object(
      'verification_id', v_verification_id,
      'intent_id', p_intent_id,
      'result', 'fail',
      'failure_code', v_fail_code
    );
  END IF;

  INSERT INTO deposit.verifications (
    intent_id, attempt_id, provider, result, failure_code, evidence,
    external_payment_id, amount_observed, currency_observed, confirmations
  ) VALUES (
    p_intent_id, p_attempt_id, p_provider, 'pass', NULL, coalesce(p_evidence, '{}'::jsonb),
    p_external_payment_id, p_amount_observed, upper(p_currency_observed), p_confirmations
  )
  RETURNING id INTO v_verification_id;

  PERFORM deposit.fn_assert_transition('verifying', 'confirmed');
  UPDATE deposit.intents SET status = 'confirmed' WHERE id = p_intent_id;

  PERFORM deposit.fn_append_event(p_intent_id, 'verification.passed', 'system',
    jsonb_build_object(
      'verification_id', v_verification_id,
      'external_payment_id', p_external_payment_id
    ));

  RETURN jsonb_build_object(
    'verification_id', v_verification_id,
    'intent_id', p_intent_id,
    'result', 'pass'
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'verification_duplicate_external_payment'
      USING ERRCODE = '23505';
END;
$$;
