-- ============================================
-- اسکریپت بررسی وضعیت اکانت ادمین
-- این اسکریپت را برای عیب‌یابی اجرا کنید
-- ============================================

-- بررسی کاربر در auth.users
SELECT 
  'auth.users' as source,
  id,
  email,
  created_at,
  email_confirmed_at,
  raw_user_meta_data
FROM auth.users
WHERE email = 'admin@dingmoney.org'
ORDER BY created_at DESC
LIMIT 1;

-- بررسی کاربر در public.users
SELECT 
  'public.users' as source,
  id,
  email,
  username,
  role,
  status,
  created_at
FROM public.users
WHERE email = 'admin@dingmoney.org'
ORDER BY created_at DESC
LIMIT 1;

-- بررسی wallet
SELECT 
  'wallet' as source,
  user_id,
  balance,
  currency,
  created_at
FROM public.wallets
WHERE user_id IN (
  SELECT id FROM public.users WHERE email = 'admin@dingmoney.org'
)
LIMIT 1;

-- بررسی ding_balance
SELECT 
  'ding_balance' as source,
  user_id,
  balance,
  created_at
FROM public.ding_balances
WHERE user_id IN (
  SELECT id FROM public.users WHERE email = 'admin@dingmoney.org'
)
LIMIT 1;

-- بررسی user_profile
SELECT 
  'user_profile' as source,
  user_id,
  language,
  created_at
FROM public.user_profiles
WHERE user_id IN (
  SELECT id FROM public.users WHERE email = 'admin@dingmoney.org'
)
LIMIT 1;

-- خلاصه وضعیت
SELECT 
  (SELECT COUNT(*) FROM auth.users WHERE email = 'admin@dingmoney.org') as in_auth_users,
  (SELECT COUNT(*) FROM public.users WHERE email = 'admin@dingmoney.org') as in_public_users,
  (SELECT COUNT(*) FROM public.wallets w 
   JOIN public.users u ON u.id = w.user_id 
   WHERE u.email = 'admin@dingmoney.org') as has_wallet,
  (SELECT COUNT(*) FROM public.ding_balances db 
   JOIN public.users u ON u.id = db.user_id 
   WHERE u.email = 'admin@dingmoney.org') as has_ding_balance,
  (SELECT COUNT(*) FROM public.user_profiles up 
   JOIN public.users u ON u.id = up.user_id 
   WHERE u.email = 'admin@dingmoney.org') as has_profile;

