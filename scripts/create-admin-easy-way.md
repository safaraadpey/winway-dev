# راه حل ساده: ایجاد اکانت ادمین

## مشکل

وقتی کاربر را از Dashboard ایجاد می‌کنید، trigger اجرا می‌شود و اگر metadata خالی باشد، فکر می‌کند player است و referral_code می‌خواهد.

## راه حل: اضافه کردن Role در User Metadata

### مرحله 1: ایجاد کاربر در Dashboard

1. به **Supabase Dashboard** > **Authentication** > **Users** > **Add user** بروید
2. اطلاعات را وارد کنید:
   - **Email**: `admin@dingmoney.org`
   - **Password**: یک رمز عبور قوی
   - **Auto Confirm User**: ✅ فعال کنید
3. **User Metadata** را باز کنید و این JSON را اضافه کنید:
   ```json
   {
     "role": "admin"
   }
   ```
4. **Create user** را بزنید

### مرحله 2: بررسی

اگر خطا نداد، کاربر باید در `public.users` ایجاد شده باشد. بررسی کنید:

```sql
SELECT * FROM public.users WHERE email = 'admin@dingmoney.org';
```

### مرحله 3: اگر هنوز خطا می‌دهد

اگر هنوز خطا می‌دهد، این یعنی trigger مشکل دارد. در این صورت:

1. کاربر را در Dashboard ایجاد کنید (ممکن است خطا بدهد، اما کاربر در `auth.users` ایجاد می‌شود)
2. این اسکریپت را اجرا کنید:

```sql
-- پیدا کردن ID
SELECT id FROM auth.users WHERE email = 'admin@dingmoney.org' ORDER BY created_at DESC LIMIT 1;

-- سپس با ID واقعی (جایگزین کنید YOUR_ID_HERE را):
INSERT INTO public.users (id, email, username, role, status, created_at)
VALUES ('YOUR_ID_HERE', 'admin@dingmoney.org', 'admin', 'admin', 'active', NOW())
ON CONFLICT (id) DO UPDATE SET role = 'admin', status = 'active';

INSERT INTO public.wallets (user_id, balance, currency, created_at)
VALUES ('YOUR_ID_HERE', 0, 'IRR', NOW()) ON CONFLICT DO NOTHING;

INSERT INTO public.ding_balances (user_id, balance, created_at)
VALUES ('YOUR_ID_HERE', 0, NOW()) ON CONFLICT DO NOTHING;

INSERT INTO public.user_profiles (user_id, language, created_at)
VALUES ('YOUR_ID_HERE', 'fa', NOW()) ON CONFLICT DO NOTHING;
```

---

## نکته مهم

**User Metadata** را حتماً اضافه کنید! این کار باعث می‌شود trigger بداند که این کاربر admin است و referral_code نمی‌خواهد.

اگر User Metadata را اضافه نکنید، trigger فکر می‌کند player است و referral_code می‌خواهد که خطا می‌دهد.

