# راهنمای ساده ایجاد اکانت ادمین

## روش سریع (پیشنهادی)

### مرحله 1: ایجاد کاربر در Dashboard

1. به **Supabase Dashboard** بروید
2. **Authentication** > **Users** > **Add user**
3. اطلاعات را وارد کنید:
   - **Email**: `admin@dingmoney.org`
   - **Password**: یک رمز عبور قوی (مثلاً: `Admin123!@#`)
   - **Auto Confirm User**: ✅ فعال کنید
4. **Create user** را بزنید

### مرحله 2: پیدا کردن User ID

در **SQL Editor** این کوئری را اجرا کنید:

```sql
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'admin@dingmoney.org'
ORDER BY created_at DESC
LIMIT 1;
```

ID را کپی کنید (مثلاً: `12345678-1234-1234-1234-123456789abc`)

### مرحله 3: ایجاد رکورد در public.users

این SQL را با ID واقعی اجرا کنید (جایگزین کنید `YOUR_ADMIN_USER_ID` را):

```sql
INSERT INTO public.users (
  id, email, username, role, status, created_at
) VALUES (
  'YOUR_ADMIN_USER_ID', -- ID از مرحله قبل
  'admin@dingmoney.org',
  'admin',
  'admin',
  'active',
  NOW()
)
ON CONFLICT (id) DO UPDATE
SET role = 'admin', status = 'active', username = 'admin';

INSERT INTO public.wallets (user_id, balance, currency, created_at)
VALUES ('YOUR_ADMIN_USER_ID', 0, 'IRR', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO public.ding_balances (user_id, balance, created_at)
VALUES ('YOUR_ADMIN_USER_ID', 0, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_profiles (user_id, language, created_at)
VALUES ('YOUR_ADMIN_USER_ID', 'fa', NOW())
ON CONFLICT DO NOTHING;
```

### مرحله 4: تست

1. به صفحه `/auth/login` بروید
2. با `admin@dingmoney.org` و رمز عبوری که ایجاد کردید وارد شوید
3. باید به صفحه `/admin/dashboard` هدایت شوید

---

## اگر trigger مشکل دارد

اگر trigger هنوز خطا می‌دهد، می‌توانید از روش بالا استفاده کنید که trigger را دور می‌زند.

Trigger فقط برای کاربران جدیدی که از طریق SignupForm ثبت‌نام می‌کنند اجرا می‌شود. برای کاربرانی که از Dashboard ایجاد می‌شوند، می‌توانید دستی رکورد را اضافه کنید.

---

## ایجاد چند اکانت ادمین

اگر می‌خواهید چند اکانت ادمین بسازید:

1. برای هر اکانت، مرحله 1 را تکرار کنید (با ایمیل‌های مختلف)
2. برای هر اکانت، مرحله 2 و 3 را تکرار کنید

مثال:
- `admin1@dingmoney.org`
- `admin2@dingmoney.org`
- و غیره...

