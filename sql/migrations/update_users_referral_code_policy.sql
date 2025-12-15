-- Migration: به‌روزرسانی RLS Policy برای تغییر referral_code
-- تاریخ: 2025-11-22
-- توضیحات: اجازه تغییر referral_code به agent, super, admin

BEGIN;

-- حذف policy قبلی (اگر وجود دارد)
DROP POLICY IF EXISTS "Users can update own referral_code" ON public.users;

-- Policy جدید: agent, super, admin می‌توانند referral_code خودشان را تغییر دهند
CREATE POLICY "Users can update own referral_code"
ON public.users
FOR UPDATE
USING (
  auth.uid() = id 
  AND (
    role = 'admin' 
    OR role = 'agent' 
    OR role = 'super'
  )
)
WITH CHECK (
  auth.uid() = id 
  AND (
    role = 'admin' 
    OR role = 'agent' 
    OR role = 'super'
  )
  -- بررسی اعتبار کد جدید (اگر NULL نیست)
  AND (
    referral_code IS NULL 
    OR public.validate_referral_code(referral_code) = TRUE
  )
);

COMMENT ON POLICY "Users can update own referral_code" ON public.users IS 
  'اجازه تغییر referral_code به agent, super, admin - با بررسی اعتبار کد';

COMMIT;

