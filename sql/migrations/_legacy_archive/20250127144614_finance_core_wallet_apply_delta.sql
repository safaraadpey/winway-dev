-- Migration: ایجاد هسته مالی واحد - fn_wallet_apply_delta
-- تاریخ: 2025-01-27
-- توضیحات: ایجاد تابع پایین‌دستی واحد برای تمام تغییرات روی wallets و transactions
--           این تابع به عنوان هسته مالی برای refactor توابع دیگر استفاده می‌شود

BEGIN;

-- 1. ایجاد schema game_finance (اگر وجود ندارد)
CREATE SCHEMA IF NOT EXISTS game_finance;

-- 2. ایجاد تابع هسته مالی
CREATE OR REPLACE FUNCTION game_finance.fn_wallet_apply_delta(
  p_user_id uuid,
  p_currency text,
  p_amount_delta numeric,
  p_transaction_type transaction_type,
  p_source_kind text,
  p_source_ref text DEFAULT NULL,  -- به صورت text برای سازگاری با source_ref در transactions
  p_description text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_allow_negative boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STRICT
AS $function$
DECLARE
  v_wallet_id uuid;
  v_wallet_balance numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_transaction_id uuid;
  v_room_id uuid;
  v_ticket_id uuid;
BEGIN
  -- 1. خواندن یا ایجاد wallet با FOR UPDATE
  SELECT id, balance INTO v_wallet_id, v_wallet_balance
  FROM public.wallets
  WHERE user_id = p_user_id AND currency = p_currency
  FOR UPDATE;
  
  IF v_wallet_id IS NULL THEN
    -- ایجاد wallet جدید
    INSERT INTO public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
    VALUES (p_user_id, p_currency, 0, 0, now(), now())
    RETURNING id, balance INTO v_wallet_id, v_wallet_balance;
  END IF;
  
  v_balance_before := v_wallet_balance;
  v_balance_after := v_balance_before + p_amount_delta;
  
  -- 2. بررسی invariantها
  IF p_amount_delta = 0 THEN
    RAISE EXCEPTION 'zero amount not allowed';
  END IF;
  
  IF NOT p_allow_negative AND v_balance_after < 0 THEN
    RAISE EXCEPTION 'insufficient funds: balance would be %', v_balance_after;
  END IF;
  
  -- 3. استخراج room_id و ticket_id از meta (اگر وجود داشته باشند)
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
  
  -- 4. به‌روزرسانی wallet
  UPDATE public.wallets
  SET balance = v_balance_after,
      updated_at = now()
  WHERE id = v_wallet_id;
  
  -- 5. ثبت transaction
  INSERT INTO public.transactions (
    id,
    wallet_id,
    user_id,
    type,
    status,
    amount,
    currency,
    description,
    balance_before,
    balance_after,
    source_kind,
    source_ref,
    room_id,
    ticket_id,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    v_wallet_id,
    p_user_id,
    p_transaction_type,
    'completed',
    ABS(p_amount_delta),  -- همیشه مثبت
    p_currency,
    COALESCE(p_description, 'wallet adjustment'),
    v_balance_before,
    v_balance_after,
    p_source_kind,
    p_source_ref,
    v_room_id,
    v_ticket_id,
    now()
  )
  RETURNING id INTO v_transaction_id;
  
  RETURN v_transaction_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback خودکار توسط transaction
    RAISE;
END;
$function$;

-- 3. Grant permissions (اگر لازم باشد)
GRANT EXECUTE ON FUNCTION game_finance.fn_wallet_apply_delta TO authenticated;
GRANT EXECUTE ON FUNCTION game_finance.fn_wallet_apply_delta TO service_role;

COMMIT;

-- ============================================================================
-- مثال‌های تست (کامنت شده - برای تست دستی استفاده شود)
-- ============================================================================

-- مثال 1: واریز 100000 تومان برای یک کاربر
-- SELECT game_finance.fn_wallet_apply_delta(
--   p_user_id := 'user-uuid-here',
--   p_currency := 'IRR',
--   p_amount_delta := 100000,
--   p_transaction_type := 'deposit',
--   p_source_kind := 'manual_panel',
--   p_source_ref := 'admin-user-id-here',
--   p_description := 'test deposit',
--   p_meta := '{}'::jsonb,
--   p_allow_negative := false
-- );

-- مثال 2: برداشت 50000 تومان
-- SELECT game_finance.fn_wallet_apply_delta(
--   p_user_id := 'user-uuid-here',
--   p_currency := 'IRR',
--   p_amount_delta := -50000,
--   p_transaction_type := 'withdraw',
--   p_source_kind := 'manual_panel',
--   p_source_ref := 'admin-user-id-here',
--   p_description := 'test withdraw',
--   p_meta := '{}'::jsonb,
--   p_allow_negative := false
-- );

-- مثال 3: تلاش برای برداشت بیش از موجودی (باید خطا بدهد)
-- SELECT game_finance.fn_wallet_apply_delta(
--   p_user_id := 'user-uuid-here',
--   p_currency := 'IRR',
--   p_amount_delta := -1000000,  -- بیشتر از موجودی
--   p_transaction_type := 'withdraw',
--   p_source_kind := 'manual_panel',
--   p_source_ref := 'admin-user-id-here',
--   p_description := 'test insufficient funds',
--   p_meta := '{}'::jsonb,
--   p_allow_negative := false
-- );
-- انتظار: ERROR: insufficient funds: balance would be -900000

-- مثال 4: واریز با metadata (room_id و ticket_id)
-- SELECT game_finance.fn_wallet_apply_delta(
--   p_user_id := 'user-uuid-here',
--   p_currency := 'IRR',
--   p_amount_delta := 5000,
--   p_transaction_type := 'fee_agent',
--   p_source_kind := 'ticket_commission',
--   p_source_ref := NULL,
--   p_description := 'ticket commission (agent)',
--   p_meta := jsonb_build_object('room_id', 'room-uuid-here', 'ticket_id', 'ticket-uuid-here'),
--   p_allow_negative := false
-- );

