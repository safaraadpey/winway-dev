# راهنمای نهایی ایجاد اکانت ادمین

## مشکل چیست؟

مشکل اصلی این بود که:
1. کد `post-login` از جدول `profiles` role را می‌خواند (که وجود ندارد)
2. باید از جدول `users` بخواند

این مشکل حل شد! ✅

---

## مراحل ایجاد اکانت ادمین

### مرحله 1: ایجاد کاربر در Dashboard

1. به **Supabase Dashboard** بروید
2. **Authentication** > **Users** > **Add user**
3. اطلاعات را وارد کنید:
   - **Email**: `admin@dingmoney.org`
   - **Password**: یک رمز عبور قوی
   - **Auto Confirm User**: ✅ فعال کنید
4. **Create user** را بزنید

### مرحله 2: اجرای اسکریپت کامل

در **SQL Editor** این اسکریپت را اجرا کنید:

```sql
-- فایل: scripts/create-admin-complete.sql
-- این اسکریپت همه چیز را بررسی و ایجاد می‌کند
```

یا مستقیماً این کد را اجرا کنید:

```sql
DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'admin@dingmoney.org';
  v_username TEXT := 'admin';
  v_exists BOOLEAN;
BEGIN
  -- پیدا کردن ID کاربر
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'کاربر با ایمیل % در auth.users پیدا نشد.', v_email;
  END IF;
  
  -- ایجاد/به‌روزرسانی در public.users
  INSERT INTO public.users (id, email, username, role, status, created_at)
  VALUES (v_user_id, v_email, v_username, 'admin', 'active', NOW())
  ON CONFLICT (id) DO UPDATE
  SET role = 'admin', status = 'active', username = v_username;
  
  -- ایجاد wallet
  INSERT INTO public.wallets (user_id, balance, currency, created_at)
  VALUES (v_user_id, 0, 'IRR', NOW())
  ON CONFLICT DO NOTHING;
  
  -- ایجاد ding_balance
  INSERT INTO public.ding_balances (user_id, balance, created_at)
  VALUES (v_user_id, 0, NOW())
  ON CONFLICT DO NOTHING;
  
  -- ایجاد user_profile
  INSERT INTO public.user_profiles (user_id, language, created_at)
  VALUES (v_user_id, 'fa', NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE '✅ اکانت ادمین با موفقیت ایجاد شد!';
END $$;
```

### مرحله 3: بررسی وضعیت (اختیاری)

اگر می‌خواهید مطمئن شوید همه چیز درست است:

```sql
-- فایل: scripts/check-admin-status.sql
-- این اسکریپت وضعیت اکانت را بررسی می‌کند
```

### مرحله 4: ورود به سیستم

1. به `/auth/login` بروید
2. با `admin@dingmoney.org` و رمز عبور وارد شوید
3. باید به `/admin/dashboard` هدایت شوید ✅

---

## عیب‌یابی

اگر هنوز مشکل دارید:

### 1. بررسی کنید که کاربر در public.users وجود دارد:

```sql
SELECT * FROM public.users WHERE email = 'admin@dingmoney.org';
```

### 2. بررسی کنید که role = 'admin' است:

```sql
SELECT id, email, role, status FROM public.users 
WHERE email = 'admin@dingmoney.org';
```

### 3. بررسی کنید که wallet و سایر جداول ایجاد شده‌اند:

```sql
SELECT 
  u.email,
  u.role,
  w.id as wallet_id,
  db.user_id as ding_balance_id,
  up.user_id as profile_id
FROM public.users u
LEFT JOIN public.wallets w ON w.user_id = u.id
LEFT JOIN public.ding_balances db ON db.user_id = u.id
LEFT JOIN public.user_profiles up ON up.user_id = u.id
WHERE u.email = 'admin@dingmoney.org';
```

---

## تغییرات انجام شده

✅ **اصلاح post-login/page.tsx**: حالا role را از جدول `users` می‌خواند (نه `profiles`)
✅ **اسکریپت کامل ایجاد اکانت**: همه چیز را خودکار انجام می‌دهد
✅ **اسکریپت بررسی وضعیت**: برای عیب‌یابی

حالا باید کار کند! 🎉

