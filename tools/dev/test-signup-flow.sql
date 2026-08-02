-- ============================================
-- اسکریپت تست جریان ثبت‌نام
-- این اسکریپت را بعد از تلاش برای ثبت‌نام اجرا کنید
-- ============================================

-- 1. بررسی آخرین کاربر در auth.users (باید referral_code در metadata داشته باشد)
SELECT 
  'auth.users' as source,
  id,
  email,
  raw_user_meta_data->>'referral_code' as ref_code,
  raw_user_meta_data->>'username' as meta_username,
  raw_user_meta_data as full_metadata,
  created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 1;

-- 2. بررسی آخرین کاربر در public.users (باید به عنوان player ایجاد شده باشد)
SELECT 
  'public.users' as source,
  id,
  email,
  username,
  role,
  status,
  parent_id,
  referral_code,
  created_at
FROM public.users
ORDER BY created_at DESC
LIMIT 1;

-- 3. بررسی player_affiliation
SELECT 
  'player_affiliation' as source,
  pa.user_id,
  pa.agent_id,
  pa.super_id,
  u.email,
  u.role
FROM public.player_affiliation pa
LEFT JOIN public.users u ON u.id = pa.user_id
ORDER BY pa.created_at DESC
LIMIT 1;

-- 4. بررسی wallet
SELECT 
  'wallet' as source,
  w.user_id,
  w.balance,
  u.email
FROM public.wallets w
LEFT JOIN public.users u ON u.id = w.user_id
ORDER BY w.created_at DESC
LIMIT 1;

-- 5. تست query trigger برای referral_code 61621811
SELECT 
  'trigger_test' as source,
  id,
  email,
  role,
  referral_code
FROM public.users
WHERE UPPER(TRIM(referral_code)) = '61621811'
AND status = 'active';

