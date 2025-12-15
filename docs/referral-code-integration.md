# راهنمای یکپارچه‌سازی کد معرف (Referral Code)

## 📋 خلاصه

سیستم از لینک‌های دعوت یکتا به **کد معرف** تغییر کرده است. در سیستم جدید:

- **همه کاربران** (حتی admin/super) باید با **کد معرف** ثبت‌نام کنند
- همه کاربران جدید ابتدا به عنوان **player** ایجاد می‌شوند
- بعداً admin می‌تواند role را از player به admin/super تغییر دهد
- هیچ کاربری بدون کد معرف نمی‌تواند ثبت‌نام کند

**Referral Code ادمین اصلی: `61621811`** (متعلق به adminzero@dingmoney.org)

---

## 🔧 نحوه کار

### 1. Frontend (پیاده‌سازی شده ✅)

در `components/auth/SignupForm.tsx`:
- فیلد "کد معرف" اضافه شده است
- اعتبارسنجی اولیه انجام می‌شود (نباید خالی باشد)
- کد معرف به صورت خودکار به uppercase تبدیل می‌شود
- بررسی معتبر بودن کد معرف در دیتابیس قبل از ثبت‌نام انجام می‌شود
- کد معرف در `user_metadata` ذخیره می‌شود

### 2. Backend (پیاده‌سازی شده ✅)

- ستون `referral_code` به جدول `users` اضافه شده است
- Function `handle_new_user()` به‌روزرسانی شده است تا:
  - **برای همه کاربران** (حتی admin/super) کد معرف را الزامی کند
  - همه کاربران جدید را به عنوان **player** ایجاد کند
  - کد معرف را از metadata استخراج کند
  - معتبر بودن کد معرف را بررسی کند
  - نقش معرف را تشخیص دهد (agent, super, یا admin)
  - جدول `player_affiliation` را پر کند
  - wallet و ding_balance را برای کاربر جدید ایجاد کند

---

## 🗄️ ساختار Database

### جدول Users

```sql
-- ستون referral_code به جدول users اضافه شده است
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Index برای جستجوی سریع
CREATE INDEX IF NOT EXISTS idx_users_referral_code
ON public.users(referral_code);
```

### جدول Player Affiliation

جدول `player_affiliation` برای ذخیره روابط بین player، agent و super استفاده می‌شود:
- `user_id`: شناسه player
- `agent_id`: شناسه agent (اگر معرف agent باشد)
- `super_id`: شناسه super (اگر معرف super باشد یا agent معرف باشد)

### ایجاد کد معرف برای کاربران

```sql
-- مثال: ایجاد کد معرف برای یک agent
UPDATE public.users
SET referral_code = 'AGENT001'
WHERE id = 'agent-uuid' AND role = 'agent';

-- مثال: ایجاد کد معرف برای یک super
UPDATE public.users
SET referral_code = 'SUPER001'
WHERE id = 'super-uuid' AND role = 'super';
```

---

## 💻 پیاده‌سازی بررسی Referral Code

### Frontend (قبل از ثبت‌نام)

در `components/auth/SignupForm.tsx`، بررسی معتبر بودن کد معرف انجام می‌شود:

```typescript
// بررسی معتبر بودن referral code
const trimmedReferralCode = referralCode.trim().toUpperCase();
const { data: referrer, error: refError } = await supabase
  .from('users')
  .select('id, role, status')
  .eq('referral_code', trimmedReferralCode)
  .eq('status', 'active')
  .single();

if (refError || !referrer) {
  toast.error("کد معرف معتبر نیست. لطفاً کد صحیح را وارد کنید");
  setLoading(false);
  return;
}

// بررسی اینکه referrer می‌تواند معرف باشد
if (referrer.role === 'player') {
  toast.error("کد معرف متعلق به player است. فقط agent، super یا admin می‌توانند معرف باشند");
  setLoading(false);
  return;
}
```

### Backend (Database Trigger)

Function `handle_new_user()` به‌روزرسانی شده است تا:
1. **برای همه کاربران** (حتی admin/super) کد معرف را الزامی کند
2. همه کاربران جدید را به عنوان **player** ایجاد کند
3. کد معرف را از metadata استخراج کند
4. معتبر بودن کد معرف را بررسی کند
5. نقش معرف را تشخیص دهد (agent, super, یا admin)
6. جدول `player_affiliation` را پر کند
7. wallet، ding_balance و user_profile را برای کاربر جدید ایجاد کند

**نکته مهم**: همه کاربران جدید (حتی admin/super) ابتدا به عنوان player ایجاد می‌شوند. بعداً admin می‌تواند role را تغییر دهد.

---

## 📝 مثال کامل Frontend

```typescript
// در components/auth/SignupForm.tsx

// بعد از اعتبارسنجی اولیه:
const { data: referrer, error: refError } = await supabase
  .from('players')
  .select('id, username, referral_code')
  .eq('referral_code', referralCode.trim().toUpperCase())
  .single();

if (refError || !referrer) {
  toast.error("کد معرف معتبر نیست. لطفاً کد صحیح را وارد کنید");
  setLoading(false);
  return;
}

// اگر کد معتبر بود، ادامه ثبت‌نام
const { data, error: signUpError } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      username: username.toLowerCase().trim(),
      referral_code: referralCode.trim().toUpperCase(),
      referrer_id: referrer.id, // ذخیره ID معرف
    },
  },
});
```

---

## ✅ Checklist

- [x] فیلد کد معرف در SignupForm اضافه شده
- [x] اعتبارسنجی اولیه (خالی نبودن) انجام می‌شود
- [x] بررسی معتبر بودن کد در دیتابیس (پیاده‌سازی شده)
- [x] ستون referral_code به جدول users اضافه شده
- [x] Function handle_new_user() به‌روزرسانی شده
- [x] جدول player_affiliation به صورت خودکار پر می‌شود
- [x] Wallet و ding_balance به صورت خودکار ایجاد می‌شوند
- [ ] ایجاد RLS policies برای دسترسی به referral codes (اختیاری)

---

## 🎯 نحوه استفاده

### برای Admin/Super/Agent: ایجاد کد معرف

```sql
-- ایجاد کد معرف برای یک agent
UPDATE public.users
SET referral_code = 'AGENT001'
WHERE id = 'agent-uuid' AND role = 'agent';

-- ایجاد کد معرف برای یک super
UPDATE public.users
SET referral_code = 'SUPER001'
WHERE id = 'super-uuid' AND role = 'super';
```

### برای Player: ثبت‌نام با کد معرف

1. به صفحه ثبت‌نام بروید
2. username و password را وارد کنید
3. کد معرف را وارد کنید (به صورت خودکار به uppercase تبدیل می‌شود)
4. سیستم به صورت خودکار:
   - معتبر بودن کد را بررسی می‌کند
   - روابط player-agent-super را ثبت می‌کند
   - wallet و ding_balance را ایجاد می‌کند

### تست سیستم

- ✅ ثبت‌نام با کد معتبر (agent/super/admin)
- ✅ ثبت‌نام با کد نامعتبر (باید خطا بدهد)
- ✅ ثبت‌نام بدون کد (باید خطا بدهد)
- ✅ ثبت‌نام با کد player (باید خطا بدهد)

---

## 📌 نکات مهم

1. **Case Sensitivity:** می‌توانید کد معرف را به uppercase تبدیل کنید تا case-insensitive باشد
2. **Security:** در RLS policies، مطمئن شوید که کاربران فقط کد معرف خودشان را ببینند
3. **Validation:** می‌توانید format کد معرف را محدود کنید (مثلاً فقط حروف و اعداد)

