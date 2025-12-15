-- ============================================
-- اسکریپت گام‌به‌گام ایجاد اکانت ادمین
-- این اسکریپت را مرحله به مرحله اجرا کنید
-- ============================================

-- ============================================
-- مرحله 1: پیدا کردن ID کاربر
-- ============================================
-- ابتدا این کوئری را اجرا کنید تا ID کاربر را پیدا کنید
-- (بعد از ایجاد کاربر در Dashboard)
SELECT 
  id, 
  email, 
  created_at,
  raw_user_meta_data
FROM auth.users 
WHERE email = 'admin@dingmoney.org'
ORDER BY created_at DESC
LIMIT 1;

-- ============================================
-- مرحله 2: ایجاد رکورد در public.users
-- ============================================
-- ⚠️ مهم: ابتدا کوئری بالا را اجرا کنید و ID را کپی کنید
-- سپس این کوئری را با ID واقعی اجرا کنید
-- 
-- مثال: اگر ID شما '12345678-1234-1234-1234-123456789abc' است:
-- 
-- INSERT INTO public.users (id, email, username, role, status, created_at)
-- VALUES ('12345678-1234-1234-1234-123456789abc', 'admin@dingmoney.org', 'admin', 'admin', 'active', NOW())
-- ON CONFLICT (id) DO UPDATE SET role = 'admin', status = 'active', username = 'admin';

-- ============================================
-- مرحله 3: ایجاد wallet و سایر جداول
-- ============================================
-- ⚠️ مهم: ID را از مرحله 1 کپی کنید و در این کوئری‌ها استفاده کنید
--
-- INSERT INTO public.wallets (user_id, balance, currency, created_at)
-- VALUES ('YOUR_ID_HERE', 0, 'IRR', NOW())
-- ON CONFLICT DO NOTHING;
--
-- INSERT INTO public.ding_balances (user_id, balance, created_at)
-- VALUES ('YOUR_ID_HERE', 0, NOW())
-- ON CONFLICT DO NOTHING;
--
-- INSERT INTO public.user_profiles (user_id, language, created_at)
-- VALUES ('YOUR_ID_HERE', 'fa', NOW())
-- ON CONFLICT DO NOTHING;

