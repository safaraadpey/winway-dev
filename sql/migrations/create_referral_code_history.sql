-- Migration: ایجاد جدول تاریخچه referral_code
-- تاریخ: 2025-11-22
-- توضیحات: ذخیره تاریخچه کدهای معرف برای امکان بازگشت به کدهای قبلی

BEGIN;

-- 1. ایجاد جدول referral_code_history
CREATE TABLE IF NOT EXISTS public.referral_code_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  changed_to TEXT, -- کد جدید (NULL اگر حذف شده باشد)
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. ایجاد index برای جستجوی سریع‌تر
CREATE INDEX IF NOT EXISTS idx_referral_code_history_user_id 
ON public.referral_code_history(user_id);

CREATE INDEX IF NOT EXISTS idx_referral_code_history_code 
ON public.referral_code_history(referral_code);

CREATE INDEX IF NOT EXISTS idx_referral_code_history_changed_at 
ON public.referral_code_history(changed_at DESC);

-- 3. اضافه کردن comment
COMMENT ON TABLE public.referral_code_history IS 
  'تاریخچه کدهای معرف کاربران - برای امکان بازگشت به کدهای قبلی';

COMMENT ON COLUMN public.referral_code_history.user_id IS 
  'شناسه کاربر (agent, super, یا admin)';

COMMENT ON COLUMN public.referral_code_history.referral_code IS 
  'کد معرف که استفاده شده است';

COMMENT ON COLUMN public.referral_code_history.changed_at IS 
  'زمان تغییر کد';

COMMENT ON COLUMN public.referral_code_history.changed_to IS 
  'کد جدید (NULL اگر کد حذف شده باشد)';

-- 4. فعال‌سازی RLS
ALTER TABLE public.referral_code_history ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policy: کاربران فقط می‌توانند تاریخچه خودشان را ببینند
DROP POLICY IF EXISTS "Users can view own referral code history" ON public.referral_code_history;
CREATE POLICY "Users can view own referral code history"
ON public.referral_code_history
FOR SELECT
USING (auth.uid() = user_id);

-- 6. RLS Policy: فقط agent, super, admin می‌توانند تاریخچه خودشان را ببینند
-- (این policy در SELECT policy بالا پوشش داده شده است)

COMMIT;

