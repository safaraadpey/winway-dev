-- ============================================
-- اسکریپت تست referral_code
-- این اسکریپت را برای عیب‌یابی اجرا کنید
-- ============================================

-- 1. بررسی referral_code در دیتابیس
SELECT 
  id,
  email,
  username,
  role,
  status,
  referral_code,
  UPPER(TRIM(referral_code)) as normalized_code
FROM public.users
WHERE referral_code = '61621811'
   OR UPPER(TRIM(referral_code)) = '61621811'
   OR email = 'adminzero@dingmoney.org';

-- 2. تست query مشابه trigger
SELECT id, role
FROM public.users
WHERE UPPER(TRIM(referral_code)) = '61621811'
AND status = 'active'
LIMIT 1;

-- 3. بررسی آخرین کاربران ایجاد شده
SELECT 
  id,
  email,
  username,
  role,
  status,
  referral_code,
  parent_id,
  created_at
FROM public.users
ORDER BY created_at DESC
LIMIT 5;

-- 4. بررسی آخرین خطاها (اگر log table دارید)
-- SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 10;

