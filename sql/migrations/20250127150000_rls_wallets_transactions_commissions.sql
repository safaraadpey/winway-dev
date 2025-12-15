-- Migration: تنظیم RLS برای جداول مالی
-- تاریخ: 2025-01-27
-- توضیحات: فعال‌سازی RLS و قفل‌کردن write مستقیم روی wallets, transactions, commissions_log
--           فقط توابع هسته مالی (با SECURITY DEFINER) می‌توانند write کنند

BEGIN;

-- ============================================================================
-- 1. فعال‌سازی RLS
-- ============================================================================

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. حذف policies قبلی (اگر وجود دارند)
-- ============================================================================

DROP POLICY IF EXISTS "wallets_select_own" ON public.wallets;
DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
DROP POLICY IF EXISTS "commissions_log_select_admin" ON public.commissions_log;

-- ============================================================================
-- 3. تعریف policyهای SELECT برای players
-- ============================================================================

-- Policy برای wallets: Player فقط wallet خودش را می‌بیند
CREATE POLICY "wallets_select_own"
ON public.wallets
FOR SELECT
USING (user_id = auth.uid());

COMMENT ON POLICY "wallets_select_own" ON public.wallets IS
  'Player فقط می‌تواند wallet خودش را بخواند';

-- Policy برای transactions: Player فقط تراکنش‌های خودش را می‌بیند
CREATE POLICY "transactions_select_own"
ON public.transactions
FOR SELECT
USING (user_id = auth.uid());

COMMENT ON POLICY "transactions_select_own" ON public.transactions IS
  'Player فقط می‌تواند تراکنش‌های خودش را بخواند';

-- Policy برای commissions_log: فقط admin می‌تواند ببیند (اختیاری)
-- Player نیازی به دیدن commissions_log ندارد
-- Admin/Super/Agent از طریق functions با SECURITY DEFINER دسترسی دارند
-- برای سادگی، هیچ policy برای SELECT تعریف نمی‌کنیم
-- (اگر نیاز باشد، می‌توان بعداً اضافه کرد)

-- ============================================================================
-- 4. قفل‌کردن write مستقیم
-- ============================================================================

-- هیچ policy برای INSERT/UPDATE/DELETE تعریف نمی‌کنیم
-- پیش‌فرض RLS: اگر policy وجود نداشته باشد، write ممنوع است
-- فقط توابع با SECURITY DEFINER (مثل game_finance.fn_wallet_apply_delta)
-- می‌توانند write کنند

-- ============================================================================
-- 5. Grant permissions (اگر لازم باشد)
-- ============================================================================

-- اطمینان از اینکه authenticated users می‌توانند SELECT کنند
-- (از طریق policies بالا)

-- ============================================================================
-- توضیحات مهم:
-- ============================================================================
-- 1. توابع هسته مالی (game_finance.fn_wallet_apply_delta و wrapperها)
--    با SECURITY DEFINER تعریف شده‌اند و از RLS عبور می‌کنند.
--    این توابع می‌توانند write کنند حتی اگر هیچ policy برای write وجود نداشته باشد.
--
-- 2. کلاینت‌های عادی (anon/authenticated) نمی‌توانند مستقیماً:
--    - wallets را INSERT/UPDATE/DELETE کنند
--    - transactions را INSERT/UPDATE/DELETE کنند
--    - commissions_log را INSERT/UPDATE/DELETE کنند
--
-- 3. Player فقط می‌تواند:
--    - wallet خودش را SELECT کند
--    - تراکنش‌های خودش را SELECT کند
--
-- 4. Admin/Super/Agent از طریق:
--    - Application logic (در services) به wallets/transactions زیرمجموعه‌ها دسترسی دارند
--    - Functions با SECURITY DEFINER به تمام داده‌ها دسترسی دارند
-- ============================================================================

COMMIT;

-- ============================================================================
-- مثال‌های تست (کامنت شده - برای تست دستی استفاده شود)
-- ============================================================================

-- مثال 1: به‌عنوان یک user عادی (player)
-- فرض: یک user با id مشخص لاگین کرده است
--
-- ✅ باید موفق شود:
-- SELECT * FROM public.wallets WHERE user_id = auth.uid();
-- SELECT * FROM public.transactions WHERE user_id = auth.uid();
--
-- ❌ باید خطای RLS بدهد:
-- UPDATE public.wallets SET balance = balance + 100 WHERE user_id = auth.uid();
-- INSERT INTO public.transactions (wallet_id, user_id, type, amount, currency)
--   VALUES ('wallet-id', auth.uid(), 'deposit', 100, 'IRR');
-- DELETE FROM public.wallets WHERE user_id = auth.uid();

-- مثال 2: به‌عنوان سیستم (از طریق fn_wallet_apply_delta)
-- فرض: یک user با id مشخص وجود دارد
--
-- ✅ باید موفق شود:
-- SELECT game_finance.fn_wallet_apply_delta(
--   p_user_id := 'user-uuid-here',
--   p_currency := 'IRR',
--   p_amount_delta := 1000,
--   p_transaction_type := 'deposit',
--   p_source_kind := 'manual_panel',
--   p_source_ref := 'admin-user-id',
--   p_description := 'test deposit via core function',
--   p_meta := '{}'::jsonb,
--   p_allow_negative := false
-- );
--
-- بررسی نتایج:
-- 1. SELECT * FROM public.wallets WHERE user_id = 'user-uuid-here';
--    - balance باید 1000 افزایش یافته باشد
-- 2. SELECT * FROM public.transactions WHERE user_id = 'user-uuid-here';
--    - باید یک تراکنش جدید با type='deposit' وجود داشته باشد

-- مثال 3: تست write مستقیم (باید خطا بدهد)
-- فرض: یک user با id مشخص لاگین کرده است
--
-- ❌ باید خطای RLS بدهد:
-- UPDATE public.wallets 
-- SET balance = balance + 500 
-- WHERE user_id = auth.uid();
-- -- انتظار: ERROR: new row violates row-level security policy

-- مثال 4: تست read wallet دیگر (باید خطا بدهد)
-- فرض: یک user با id مشخص لاگین کرده است
--
-- ❌ باید خطای RLS بدهد (یا هیچ نتیجه‌ای برنگرداند):
-- SELECT * FROM public.wallets WHERE user_id != auth.uid();
-- -- انتظار: فقط wallet خود user برگردانده می‌شود (یا هیچ نتیجه‌ای)

-- مثال 5: تست read transactions دیگر (باید خطا بدهد)
-- فرض: یک user با id مشخص لاگین کرده است
--
-- ❌ باید خطای RLS بدهد (یا هیچ نتیجه‌ای برنگرداند):
-- SELECT * FROM public.transactions WHERE user_id != auth.uid();
-- -- انتظار: فقط تراکنش‌های خود user برگردانده می‌شود (یا هیچ نتیجه‌ای)

