-- ============================================
-- تست دستی trigger
-- این اسکریپت را برای عیب‌یابی اجرا کنید
-- ============================================

-- 1. تست query که trigger استفاده می‌کند
DO $$
DECLARE
  v_test_referral_code TEXT := '61621811';
  v_referrer_id UUID;
  v_referrer_role user_role;
BEGIN
  SELECT id, role INTO v_referrer_id, v_referrer_role
  FROM public.users
  WHERE referral_code IS NOT NULL
  AND UPPER(TRIM(referral_code)) = UPPER(TRIM(v_test_referral_code))
  AND status = 'active'
  LIMIT 1;
  
  IF v_referrer_id IS NULL THEN
    RAISE NOTICE '❌ Referrer پیدا نشد!';
  ELSE
    RAISE NOTICE '✅ Referrer پیدا شد: ID=%, Role=%', v_referrer_id, v_referrer_role;
  END IF;
END $$;

-- 2. بررسی آخرین کاربر ایجاد شده
SELECT 
  id,
  email,
  raw_user_meta_data->>'referral_code' as ref_code,
  raw_user_meta_data->>'username' as meta_username,
  created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 3;

-- 3. بررسی اینکه آیا کاربر در public.users ایجاد شده
SELECT 
  id,
  email,
  username,
  role,
  status,
  parent_id,
  created_at
FROM public.users
ORDER BY created_at DESC
LIMIT 3;

