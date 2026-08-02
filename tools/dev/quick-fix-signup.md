# راه حل سریع برای خطای ثبت‌نام

## بررسی سریع

### 1. بررسی Referral Code

```sql
SELECT * FROM public.users WHERE referral_code = '61621811';
```

باید یک رکورد با `role = 'admin'` برگرداند.

### 2. تست Query Trigger

```sql
SELECT id, role
FROM public.users
WHERE UPPER(TRIM(referral_code)) = '61621811'
AND status = 'active';
```

باید یک رکورد برگرداند.

### 3. بررسی Metadata

اگر خطا می‌دهد، بررسی کنید که referral_code در metadata ذخیره می‌شود:

```sql
SELECT id, email, raw_user_meta_data->>'referral_code' as ref_code
FROM auth.users
ORDER BY created_at DESC
LIMIT 1;
```

---

## اگر هنوز خطا می‌دهد

لطفاً این کوئری را اجرا کنید و نتیجه را بفرستید:

```sql
-- بررسی کامل وضعیت
SELECT 
  'adminzero' as check_type,
  id, email, username, role, status, referral_code
FROM public.users
WHERE email = 'adminzero@dingmoney.org'
UNION ALL
SELECT 
  'referral_code' as check_type,
  id, email, username, role, status, referral_code
FROM public.users
WHERE referral_code = '61621811';
```

و همچنین متن کامل خطا را از Supabase Dashboard > Logs بفرستید.

