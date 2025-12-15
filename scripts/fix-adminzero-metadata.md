# راه حل: ref_code در metadata null است

## وضعیت فعلی

- ✅ در `public.users`: referral_code = '61621811' (درست است)
- ❌ در `auth.users`: raw_user_meta_data->>'referral_code' = null

## آیا این مشکل است؟

**خیر!** این طبیعی است چون:
- adminzero از Dashboard ایجاد شده (نه از SignupForm)
- referral_code در metadata ذخیره نشده
- اما referral_code در جدول `public.users` وجود دارد
- trigger از جدول `public.users` می‌خواند (نه از metadata)

## مشکل واقعی

مشکل این است که وقتی کاربر جدید می‌خواهد ثبت‌نام کند:
1. referral_code را در SignupForm وارد می‌کند
2. referral_code باید در metadata کاربر جدید ذخیره شود
3. trigger باید referral_code را از metadata کاربر جدید بخواند
4. سپس referrer را در `public.users` پیدا کند

## بررسی

بعد از تلاش برای ثبت‌نام، این کوئری را اجرا کنید:

```sql
-- بررسی آخرین کاربر ایجاد شده
SELECT 
  id,
  email,
  raw_user_meta_data->>'referral_code' as ref_code,
  raw_user_meta_data->>'username' as meta_username,
  created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 1;
```

اگر `ref_code` null است، یعنی referral_code در metadata ذخیره نشده است.

## راه حل

اگر referral_code در metadata ذخیره نمی‌شود، بررسی کنید:

1. **در SignupForm**: مطمئن شوید که referral_code در `options.data` ذخیره می‌شود:

```typescript
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      username: username.toLowerCase().trim(),
      referral_code: trimmedReferralCode, // باید اینجا باشد
    },
  },
});
```

2. **بررسی Console**: در Developer Tools > Console، خطاها را بررسی کنید.

3. **بررسی Network**: در Developer Tools > Network، request به Supabase را بررسی کنید و ببینید آیا referral_code در payload است یا نه.

---

## تست کامل

برای تست:

1. به `/auth/signup` بروید
2. Username: `testuser123`
3. Password: `test123456`
4. Referral Code: `61621811`
5. ثبت‌نام کنید
6. این کوئری را اجرا کنید:

```sql
SELECT 
  id,
  email,
  raw_user_meta_data->>'referral_code' as ref_code
FROM auth.users
WHERE email = 'testuser123@dingmoney.org';
```

باید `ref_code = "61621811"` باشد.

