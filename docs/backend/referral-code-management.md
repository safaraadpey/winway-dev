# مستندات مدیریت Referral Code

## 📋 خلاصه

این سیستم امکان مدیریت referral_code را برای agent، super و admin فراهم می‌کند:
- ثبت کد جدید (3-8 کاراکتر، حروف و اعداد)
- مشاهده تاریخچه کدهای قبلی
- بازگشت به کدهای قبلی (اگر آزاد باشند)

---

## 🗄️ ساختار دیتابیس

### جدول `referral_code_history`

```sql
CREATE TABLE public.referral_code_history (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  referral_code TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_to TEXT, -- کد جدید
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**نکات:**
- هر بار که یک کاربر `referral_code` خود را تغییر می‌دهد، کد قبلی در این جدول ذخیره می‌شود
- Trigger به صورت خودکار تاریخچه را ذخیره می‌کند
- کاربر می‌تواند به کدهای قبلی خود برگردد (اگر آزاد باشند)

---

## 🔧 Functions

### 1. `validate_referral_code(p_code TEXT)`

بررسی اعتبار referral_code:
- طول: 3-8 کاراکتر
- فقط حروف انگلیسی و اعداد

```sql
SELECT public.validate_referral_code('ABC123'); -- true
SELECT public.validate_referral_code('AB'); -- false (کوتاه)
SELECT public.validate_referral_code('ABC@123'); -- false (کاراکتر غیرمجاز)
```

### 2. `check_referral_code_available(p_code TEXT, p_user_id UUID)`

بررسی اینکه آیا یک کد قابل استفاده است:
- آزاد است (NULL)
- متعلق به کاربر فعلی است
- در تاریخچه کاربر است و الان آزاد است

```sql
SELECT public.check_referral_code_available('ABC123', 'user-uuid');
```

### 3. `get_user_referral_code_history(p_user_id UUID)`

دریافت تاریخچه کدهای یک کاربر:

```sql
SELECT * FROM public.get_user_referral_code_history('user-uuid');
```

**نتیجه:**
- `referral_code`: کد
- `changed_at`: زمان تغییر
- `changed_to`: کد جدید
- `is_current`: آیا کد فعلی است

### 4. `save_referral_code_history()` (Trigger Function)

به صورت خودکار هنگام تغییر `referral_code` در جدول `users`، کد قبلی را در تاریخچه ذخیره می‌کند.

---

## 💻 استفاده در Frontend

### Helper Functions

تمام helper functions در `lib/auth-helpers.ts` تعریف شده‌اند:

#### 1. `validateReferralCodeFormat(code: string)`

```typescript
import { validateReferralCodeFormat } from '@/lib/auth-helpers';

if (!validateReferralCodeFormat('ABC123')) {
  toast.error('کد باید 3-8 کاراکتر و فقط حروف و اعداد باشد');
}
```

#### 2. `checkReferralCodeAvailable(code: string, userId: string)`

```typescript
import { checkReferralCodeAvailable } from '@/lib/auth-helpers';

const isAvailable = await checkReferralCodeAvailable('ABC123', userId);
if (!isAvailable) {
  toast.error('این کد در حال حاضر استفاده می‌شود');
}
```

#### 3. `getReferralCodeHistory()`

```typescript
import { getReferralCodeHistory } from '@/lib/auth-helpers';

const history = await getReferralCodeHistory();
// نمایش کدهای قبلی در UI
```

#### 4. `updateReferralCode(newCode: string)`

```typescript
import { updateReferralCode } from '@/lib/auth-helpers';

const success = await updateReferralCode('ABC123');
if (success) {
  toast.success('کد معرف با موفقیت تغییر کرد');
}
```

#### 5. `getCurrentReferralCode()`

```typescript
import { getCurrentReferralCode } from '@/lib/auth-helpers';

const currentCode = await getCurrentReferralCode();
if (currentCode) {
  console.log('کد فعلی:', currentCode);
}
```

---

## 🎯 صفحات UI

### Agent Settings
- مسیر: `/agent/settings`
- فایل: `app/(agent)/settings/page.tsx`

### Admin Settings
- مسیر: `/admin/settings`
- فایل: `app/(admin)/settings/page.tsx`

### ویژگی‌های UI:
1. نمایش کد فعلی
2. ثبت کد جدید با اعتبارسنجی
3. بررسی در دسترس بودن کد
4. نمایش تاریخچه کدها
5. امکان بازگشت به کدهای قبلی

---

## 🔒 امنیت

### RLS Policies

1. **referral_code_history**: کاربران فقط می‌توانند تاریخچه خودشان را ببینند
2. **users.referral_code**: فقط agent, super, admin می‌توانند کد خودشان را تغییر دهند

### اعتبارسنجی

- **Frontend**: بررسی format و در دسترس بودن
- **Backend**: بررسی format با function `validate_referral_code`
- **Database**: UNIQUE constraint روی `referral_code`

---

## 📝 مثال‌های استفاده

### مثال 1: تغییر کد

```typescript
// 1. بررسی اعتبار
if (!validateReferralCodeFormat('ABC123')) {
  return;
}

// 2. بررسی در دسترس بودن
const isAvailable = await checkReferralCodeAvailable('ABC123', userId);
if (!isAvailable) {
  return;
}

// 3. تغییر کد
await updateReferralCode('ABC123');
```

### مثال 2: بازگشت به کد قبلی

```typescript
// 1. دریافت تاریخچه
const history = await getReferralCodeHistory();

// 2. پیدا کردن کد قبلی
const previousCode = history.find(item => !item.is_current);

// 3. بازگشت
if (previousCode) {
  await updateReferralCode(previousCode.referral_code);
}
```

---

## ⚠️ نکات مهم

1. **UNIQUE Constraint**: هر کد فقط می‌تواند توسط یک کاربر استفاده شود
2. **تاریخچه**: کدهای قبلی در تاریخچه ذخیره می‌شوند
3. **بازگشت**: کاربر می‌تواند به کدهای قبلی خود برگردد (اگر آزاد باشند)
4. **Format**: کد باید 3-8 کاراکتر و فقط حروف و اعداد باشد
5. **Trigger**: تاریخچه به صورت خودکار ذخیره می‌شود

---

## 🔄 Migration Checklist

- [x] ایجاد جدول `referral_code_history`
- [x] ایجاد function `validate_referral_code`
- [x] ایجاد function `check_referral_code_available`
- [x] ایجاد function `get_user_referral_code_history`
- [x] ایجاد trigger برای ذخیره تاریخچه
- [x] به‌روزرسانی RLS policies
- [x] ایجاد helper functions در TypeScript
- [x] ایجاد صفحه Settings برای agent
- [x] ایجاد صفحه Settings برای admin

---

## 📚 فایل‌های مرتبط

### Database:
- `sql/migrations/create_referral_code_history.sql`
- `sql/functions/validate_referral_code.sql`
- `sql/functions/save_referral_code_history.sql`
- `sql/functions/get_user_referral_code_history.sql`
- `sql/functions/check_referral_code_available.sql`
- `sql/migrations/update_users_referral_code_policy.sql`

### Frontend:
- `lib/auth-helpers.ts` (helper functions)
- `app/(agent)/settings/page.tsx` (صفحه Settings ایجنت)
- `app/(admin)/settings/page.tsx` (صفحه Settings ادمین)

---

## 🆘 پشتیبانی

اگر سوالی دارید یا مشکلی پیش آمد، لطفاً با تیم توسعه تماس بگیرید.

