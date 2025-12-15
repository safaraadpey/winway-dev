-- ============================================
-- اسکریپت تنظیم adminzero@dingmoney.org
-- این اسکریپت referral_code را برای adminzero تنظیم می‌کند
-- ============================================

-- بررسی وضعیت فعلی
SELECT 
  id, 
  email, 
  username, 
  role, 
  status, 
  referral_code,
  created_at
FROM public.users
WHERE email = 'adminzero@dingmoney.org';

-- تنظیم referral_code برای adminzero
UPDATE public.users
SET referral_code = '61621811'
WHERE email = 'adminzero@dingmoney.org'
RETURNING id, email, username, role, status, referral_code;

-- بررسی نهایی
SELECT 
  id, 
  email, 
  username, 
  role, 
  status, 
  referral_code
FROM public.users
WHERE email = 'adminzero@dingmoney.org' 
   OR referral_code = '61621811';

