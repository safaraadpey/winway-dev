# راه حل نهایی: ایجاد اکانت ادمین بدون trigger

اگر trigger هنوز مشکل دارد، می‌توانید کاربر را در Dashboard ایجاد کنید و بعد دستی رکورد را اضافه کنید.

## روش کار

### مرحله 1: ایجاد کاربر در Dashboard (بدون User Metadata)

1. به **Supabase Dashboard** > **Authentication** > **Users** > **Add user** بروید
2. اطلاعات را وارد کنید:
   - **Email**: `admin@dingmoney.org`
   - **Password**: یک رمز عبور قوی
   - **Auto Confirm User**: ✅ فعال کنید
   - **User Metadata**: خالی بگذارید (نیازی نیست)
3. **Create user** را بزنید

این کار باید بدون خطا انجام شود چون trigger برای admin کار می‌کند.

### مرحله 2: اگر هنوز خطا می‌دهد - ایجاد دستی

اگر هنوز خطا می‌دهد، این یعنی trigger مشکل دارد. در این صورت:

1. کاربر را در Dashboard ایجاد کنید (ممکن است خطا بدهد، اما کاربر در `auth.users` ایجاد می‌شود)
2. این اسکریپت را اجرا کنید:

```sql
-- پیدا کردن ID
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'admin@dingmoney.org'
ORDER BY created_at DESC
LIMIT 1;

-- سپس با ID واقعی این کوئری‌ها را اجرا کنید:
-- (جایگزین کنید YOUR_ID_HERE را)

INSERT INTO public.users (id, email, username, role, status, created_at)
VALUES ('YOUR_ID_HERE', 'admin@dingmoney.org', 'admin', 'admin', 'active', NOW())
ON CONFLICT (id) DO UPDATE
SET role = 'admin', status = 'active', username = 'admin';

INSERT INTO public.wallets (user_id, balance, currency, created_at)
VALUES ('YOUR_ID_HERE', 0, 'IRR', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO public.ding_balances (user_id, balance, created_at)
VALUES ('YOUR_ID_HERE', 0, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_profiles (user_id, language, created_at)
VALUES ('YOUR_ID_HERE', 'fa', NOW())
ON CONFLICT DO NOTHING;
```

### مرحله 3: تست

1. به `/auth/login` بروید
2. با `admin@dingmoney.org` وارد شوید
3. باید به `/admin/dashboard` هدایت شوید

---

## اگر trigger مشکل دارد

اگر trigger هنوز مشکل دارد، می‌توانید موقتاً آن را غیرفعال کنید (اما این کار نیاز به دسترسی superuser دارد که ندارید).

بهترین راه این است که trigger را درست کنیم. اگر هنوز خطا می‌دهد، لطفاً متن کامل خطا را بفرستید.

