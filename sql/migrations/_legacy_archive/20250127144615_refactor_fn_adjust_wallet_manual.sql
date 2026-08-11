-- Migration: Refactor fn_adjust_wallet_manual برای استفاده از fn_wallet_apply_delta
-- تاریخ: 2025-01-27
-- توضیحات: تبدیل fn_adjust_wallet_manual به wrapper برای fn_wallet_apply_delta
--           این تابع دیگر مستقیماً wallets و transactions را نمی‌نویسد
--           مسئولیت write با fn_wallet_apply_delta است

BEGIN;

-- ============================================================================
-- توضیحات:
-- ============================================================================
-- از این به بعد، fn_adjust_wallet_manual فقط یک wrapper business-level است
-- که منطق امنیتی (بررسی نقش) و validation را انجام می‌دهد، سپس
-- fn_wallet_apply_delta را فراخوانی می‌کند.
--
-- تمام write operations روی wallets و transactions از طریق
-- game_finance.fn_wallet_apply_delta انجام می‌شود.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_adjust_wallet_manual(
  p_target_user uuid,
  p_amount numeric,
  p_currency text,
  p_type transaction_type,
  p_description text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_actor uuid;
  v_actor_role text;
  v_amount_delta numeric;
  v_transaction_id uuid;
BEGIN
  -- 1. بررسی نقش (منطق امنیتی)
  v_actor := auth.uid();
  
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'permission denied: user not authenticated';
  END IF;
  
  SELECT role INTO v_actor_role
  FROM public.users
  WHERE id = v_actor;
  
  IF v_actor_role NOT IN ('admin', 'agent', 'super') THEN
    RAISE EXCEPTION 'permission denied: only admin/agent/super can adjust wallets';
  END IF;
  
  -- 2. Validation
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;
  
  IF p_type NOT IN ('deposit', 'withdraw') THEN
    RAISE EXCEPTION 'unsupported transaction type: %', p_type;
  END IF;
  
  -- 3. تعیین delta بر اساس type
  IF p_type = 'deposit' THEN
    v_amount_delta := p_amount;
  ELSIF p_type = 'withdraw' THEN
    v_amount_delta := -p_amount;
  END IF;
  
  -- 4. فراخوانی هسته مالی
  SELECT game_finance.fn_wallet_apply_delta(
    p_user_id := p_target_user,
    p_currency := p_currency,
    p_amount_delta := v_amount_delta,
    p_transaction_type := p_type,
    p_source_kind := 'manual_panel',
    p_source_ref := v_actor::text,  -- تبدیل به text برای سازگاری
    p_description := COALESCE(p_description, 'manual panel adjustment'),
    p_meta := '{}'::jsonb,
    p_allow_negative := false
  ) INTO v_transaction_id;
  
  -- تابع void است، بنابراین transaction_id را برنمی‌گردانیم
  -- اما می‌توان در آینده signature را تغییر داد اگر نیاز باشد
END;
$function$;

COMMIT;

