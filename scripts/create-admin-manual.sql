-- ============================================
-- اسکریپت ایجاد دستی اکانت ادمین
-- این اسکریپت را بعد از ایجاد کاربر در Dashboard اجرا کنید
-- ============================================

-- مرحله 1: پیدا کردن ID کاربر (بعد از ایجاد در Dashboard)
-- این کوئری را اجرا کنید و ID را کپی کنید:
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'admin@dingmoney.org'
ORDER BY created_at DESC
LIMIT 1;

-- مرحله 2: ایجاد رکورد در public.users
-- ⚠️ جایگزین کنید 'YOUR_ADMIN_USER_ID' را با ID از مرحله قبل
/*
INSERT INTO public.users (
  id,
  email,
  username,
  role,
  status,
  created_at
) VALUES (
  'YOUR_ADMIN_USER_ID', -- ID از auth.users
  'admin@dingmoney.org',
  'admin',
  'admin',
  'active',
  NOW()
)
ON CONFLICT (id) DO UPDATE
SET 
  role = 'admin',
  status = 'active',
  username = 'admin';
*/

-- مرحله 3: ایجاد wallet
/*
INSERT INTO public.wallets (
  user_id,
  balance,
  currency,
  created_at
) VALUES (
  'YOUR_ADMIN_USER_ID',
  0,
  'IRR',
  NOW()
)
ON CONFLICT DO NOTHING;
*/

-- مرحله 4: ایجاد ding_balance
/*
INSERT INTO public.ding_balances (
  user_id,
  balance,
  created_at
) VALUES (
  'YOUR_ADMIN_USER_ID',
  0,
  NOW()
)
ON CONFLICT DO NOTHING;
*/

-- مرحله 5: ایجاد user_profile
/*
INSERT INTO public.user_profiles (
  user_id,
  language,
  created_at
) VALUES (
  'YOUR_ADMIN_USER_ID',
  'fa',
  NOW()
)
ON CONFLICT DO NOTHING;
*/

-- ============================================
-- راهنمای استفاده:
-- ============================================
-- 1. به Supabase Dashboard > Authentication > Users بروید
-- 2. روی "Add user" کلیک کنید
-- 3. اطلاعات را وارد کنید:
--    - Email: admin@dingmoney.org
--    - Password: یک رمز عبور قوی
--    - Auto Confirm User: ✅ فعال کنید
-- 4. Create user را بزنید
-- 5. مرحله 1 را اجرا کنید و ID را کپی کنید
-- 6. مراحل 2-5 را با ID واقعی اجرا کنید (/* */ را بردارید)
-- 7. با admin@dingmoney.org وارد شوید

