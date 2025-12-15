# نکات مهم: سیستم احراز هویت با Username

## 📋 خلاصه

در این سیستم، کاربر فقط **username** و **password** وارد می‌کند (نه email).

سیستم خودکار ایمیل را می‌سازد: `${username.toLowerCase()}@dingmoney.org`

---

## 🔧 نحوه کار

### 1. Frontend

- کاربر فقط `username` وارد می‌کند (مثلاً: `alipro`)
- سیستم خودکار ایمیل را می‌سازد: `alipro@dingmoney.org`
- از `supabase.auth.signUp()` یا `signInWithPassword()` با ایمیل ساخته شده استفاده می‌شود

### 2. Helper Functions

```typescript
// تبدیل username به email
usernameToEmail("alipro") // => "alipro@dingmoney.org"

// استخراج username از email
emailToUsername("alipro@dingmoney.org") // => "alipro"
```

---

## 🗄️ استفاده در Database

### در RLS Policies

```sql
-- مثال: فقط کاربر خودش می‌تواند پروفایل خودش را ببیند
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (
  -- استخراج username از email
  REPLACE(auth.email(), '@dingmoney.org', '') = username
);
```

### در Profiles Table

اگر جدول `profiles` دارید، باید `username` را از `email` استخراج کنید:

```sql
-- Trigger برای استخراج username از email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    REPLACE(NEW.email, '@dingmoney.org', ''), -- استخراج username
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

---

## 📝 مثال‌های استفاده

### در RLS Policy

```sql
-- فقط کاربر خودش می‌تواند wallet خودش را ببیند
CREATE POLICY "Users can view own wallet"
ON public.wallets
FOR SELECT
USING (
  player_id IN (
    SELECT id FROM public.players
    WHERE REPLACE(auth.email(), '@dingmoney.org', '') = username
  )
);
```

### در Query

```sql
-- پیدا کردن player با username
SELECT * FROM public.players
WHERE username = REPLACE(auth.email(), '@dingmoney.org', '');
```

---

## ⚠️ نکات مهم

1. **Username Validation**: فقط حروف انگلیسی، اعداد و زیرخط مجاز است (3-20 کاراکتر)
2. **Case Insensitive**: همه username ها به lowercase تبدیل می‌شوند
3. **Email Format**: همیشه `@dingmoney.org` استفاده می‌شود
4. **RLS Policies**: همیشه از `REPLACE(auth.email(), '@dingmoney.org', '')` استفاده کنید

---

## 🔄 Migration Example

اگر جدول `profiles` یا `players` دارید و `username` ندارید:

```sql
-- اضافه کردن ستون username
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT;

-- پر کردن username از email
UPDATE public.profiles
SET username = REPLACE(email, '@dingmoney.org', '')
WHERE email LIKE '%@dingmoney.org';

-- ایجاد index
CREATE INDEX IF NOT EXISTS idx_profiles_username
ON public.profiles(username);

-- ایجاد unique constraint
ALTER TABLE public.profiles
ADD CONSTRAINT unique_username UNIQUE (username);
```

---

## ✅ Checklist

- [x] Helper functions در `lib/auth-helpers.ts` آماده است
- [x] کامپوننت‌های LoginForm و SignupForm آماده است
- [x] Toast notifications با react-hot-toast تنظیم شده است
- [ ] RLS policies به‌روزرسانی شده (باید انجام دهید)
- [ ] Profiles table با username ستون آماده است (باید بررسی کنید)
- [ ] Trigger برای استخراج username از email ایجاد شده (باید بررسی کنید)

---

## 🎯 مراحل بعدی

1. بررسی کنید که آیا جدول `profiles` یا `players` `username` دارد یا نه
2. اگر ندارد، migration بالا را اجرا کنید
3. RLS policies را به‌روزرسانی کنید تا از `REPLACE(auth.email(), '@dingmoney.org', '')` استفاده کنند
4. Trigger برای استخراج خودکار username از email ایجاد کنید

