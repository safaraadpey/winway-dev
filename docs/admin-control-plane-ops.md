# نقشه عملیات کنترل‌پلین ادمین

**تاریخ ایجاد:** 2025-01-27  
**هدف:** استخراج کامل تمام نقاطی که ادمین از فرانت مستقیماً دیتابیس را تغییر می‌دهد

---

## 1. استخراج عملیات حساس ادمین

### 1.1. عملیات روی جدول `users`

#### 1.1.1. تغییر نقش کاربر (`changeUserRole`)

**[MIGRATED_TO_ADMIN_API_PHASE_4]** ✅

**مسیر فایل:** `services/user-account.ts`  
**فراخوانی از:** `components/admin/UserAccountPage.tsx`  
**نوع عملیات:** UPDATE (اکنون از Admin API استفاده می‌کند)  
**جدول هدف:** `users` (ستون‌های `role`, `admin_sub_role`, `parent_id`)  
**عملیات مرتبط:** UPSERT روی `user_commissions` (مدیریت کمیسیون بر اساس نقش جدید)  
**API Route:** `POST /api/admin/users/set-role`

**توضیح UI:**
- در صفحه حساب کاربر (`/admin/users/[userId]` یا `/agent/users/[userId]`)
- یک dropdown برای انتخاب نقش جدید (player → agent/super/admin)
- برای تبدیل به admin، sub-role نیز انتخاب می‌شود (مدیر کل، مالی، پشتیبانی، اتاق‌ها)
- دکمه "ذخیره" برای اعمال تغییر

**قوانین دسترسی:**
- فقط Admin می‌تواند نقش را به Super یا Admin تبدیل کند
- Super فقط می‌تواند Player را به Agent تبدیل کند
- Agent فقط می‌تواند Player را به Agent تبدیل کند
- تنزل نقش ممنوع است (Super نمی‌تواند به Agent تبدیل شود)

---

#### 1.1.2. تعلیق/فعال‌سازی اکانت (`toggleUserSuspension`)

**[MIGRATED_TO_ADMIN_API_PHASE_4]** ✅

**مسیر فایل:** `services/user-account.ts`  
**فراخوانی از:** `components/admin/UserAccountPage.tsx`  
**نوع عملیات:** UPDATE (اکنون از Admin API استفاده می‌کند)  
**جدول هدف:** `users` (ستون `status`: `active` ↔ `suspended`)  
**API Route:** `POST /api/admin/users/toggle-suspension`

**توضیح UI:**
- در صفحه حساب کاربر
- دکمه "تعلیق اکانت" یا "فعال‌سازی اکانت" (toggle)
- با کلیک، وضعیت کاربر بین `active` و `suspended` تغییر می‌کند
- کاربر تعلیق‌شده نمی‌تواند لاگین کند و پیام خاصی می‌بیند

---

#### 1.1.3. تغییر `admin_sub_role` (`changeAdminSubRole`)

**[MIGRATED_TO_ADMIN_API_PHASE_4]** ✅

**مسیر فایل:** `services/admins.ts`  
**فراخوانی از:** `components/admin/AdminsList.tsx`  
**نوع عملیات:** UPDATE (اکنون از Admin API استفاده می‌کند)  
**جدول هدف:** `users` (ستون `admin_sub_role`: `null` | `finance` | `support` | `room`)  
**API Route:** `POST /api/admin/admins/set-sub-role`

**توضیح UI:**
- در صفحه مدیریت مدیران (`/admin/admins`)
- برای هر مدیر، یک dropdown برای انتخاب sub-role
- گزینه‌ها: مدیر کل (`null`), مالی, پشتیبانی, اتاق‌ها
- فقط مدیر کل (`admin_sub_role = null`) می‌تواند این تغییر را انجام دهد

---

#### 1.1.4. تعلیق/فعال‌سازی مدیر (`toggleAdminStatus`)

**[MIGRATED_TO_ADMIN_API_PHASE_4]** ✅

**مسیر فایل:** `services/admins.ts`  
**فراخوانی از:** `components/admin/AdminsList.tsx`  
**نوع عملیات:** UPDATE (اکنون از Admin API استفاده می‌کند)  
**جدول هدف:** `users` (ستون `status`: `active` ↔ `suspended`)  
**API Route:** `POST /api/admin/admins/toggle-status`

**توضیح UI:**
- در صفحه مدیریت مدیران
- دکمه "تعلیق" یا "فعال‌سازی" برای هر مدیر
- فقط مدیر کل می‌تواند این تغییر را انجام دهد

---

### 1.2. عملیات روی جدول `user_commissions`

#### 1.2.1. ذخیره درصد کمیسیون (`saveUserCommission`)

**مسیر فایل:** `services/user-account.ts`  
**فراخوانی از:** `components/admin/UserAccountPage.tsx`  
**نوع عملیات:** UPSERT  
**جدول هدف:** `user_commissions` (ستون‌های `agent_commission` یا `super_commission`)

**توضیح UI:**
- در صفحه حساب کاربر
- فقط برای Agent و Super نمایش داده می‌شود
- یک input field برای درصد کمیسیون (0-100)
- دکمه "ثبت" برای ذخیره
- درصد به اعشار (0-1) تبدیل می‌شود و در `user_commissions` ذخیره می‌شود

---

### 1.3. عملیات روی جدول `admin_permissions`

#### 1.3.1. به‌روزرسانی دسترسی‌های مدیر (`updateAdminPermissions`)

**مسیر فایل:** `services/admins.ts`  
**فراخوانی از:** `components/admin/AdminsList.tsx`  
**نوع عملیات:** DELETE + INSERT  
**جدول هدف:** `admin_permissions`

**توضیح UI:**
- در صفحه مدیریت مدیران
- برای هر مدیر، دکمه "دسترسی‌ها"
- یک modal با toggle switches برای هر permission:
  - `rooms`: دسترسی به مدیریت اتاق‌ها
  - `users`: دسترسی به مدیریت کاربران
  - `transactions`: دسترسی به مدیریت تراکنش‌ها
  - `entry_banner`: دسترسی به مدیریت بنر ورودی
  - `admins`: دسترسی به مدیریت مدیران
- دکمه "ذخیره" برای اعمال تغییرات
- فقط مدیر کل می‌تواند این تغییر را انجام دهد

**منطق:**
- ابتدا دسترسی‌های قدیمی حذف می‌شوند (DELETE)
- سپس دسترسی‌های جدید اضافه می‌شوند (INSERT)

---

### 1.4. عملیات روی جدول `room_templates`

#### 1.4.1. ایجاد/ویرایش Room Template (`saveRoomTemplate`)

**مسیر فایل:** `services/rooms.ts`  
**فراخوانی از:** `app/(admin)/room-templates/page.tsx`  
**نوع عملیات:** INSERT (اگر `id` خالی باشد) یا UPDATE (اگر `id` موجود باشد)  
**جدول هدف:** `room_templates`

**توضیح UI:**
- در صفحه تنظیمات اتاق‌ها (`/admin/room-templates`)
- کامپوننت `RoomTemplatePanel` برای هر template
- فیلدهای قابل ویرایش:
  - `name`: نام اتاق
  - `price`: قیمت کارت
  - `currency`: نوع ارز
  - `min_players`: حداقل تعداد بازیکن
  - `countdown_sec`: زمان شمارش معکوس
  - `line_reward_percentage`: درصد جایزه خطی
  - `full_reward_percentage`: درصد جایزه کامل
  - `vip`: اتاق VIP
  - `password`: رمز عبور
  - `repeatable`: قابل تکرار
  - `scheduled_start_time`: زمان شروع برنامه‌ریزی شده
  - `ding_per_number`: دینگ به ازای هر شماره
  - `room_type`: نوع اتاق
  - `commission_rate`: نرخ کمیسیون
  - `max_cards_per_player`: حداکثر کارت به ازای هر بازیکن
- دکمه "ذخیره" برای اعمال تغییرات

---

#### 1.4.2. حذف Room Template (`deleteRoomTemplate`)

**مسیر فایل:** `services/rooms.ts`  
**فراخوانی از:** `app/(admin)/room-templates/page.tsx`  
**نوع عملیات:** DELETE  
**جدول هدف:** `room_templates`

**توضیح UI:**
- در صفحه تنظیمات اتاق‌ها
- برای هر template، دکمه "حذف"
- پس از تایید، template حذف می‌شود

---

### 1.5. عملیات روی جدول `entry_banners`

#### 1.5.1. ایجاد بنر ورودی (`createEntryBanner`)

**مسیر فایل:** `services/entry-banner.ts`  
**فراخوانی از:** `app/(admin)/admin/entry-banner/create/page.tsx`  
**نوع عملیات:** INSERT  
**جدول هدف:** `entry_banners`

**توضیح UI:**
- در صفحه ایجاد بنر ورودی (`/admin/entry-banner/create`)
- فرم با فیلدهای:
  - `title`: عنوان بنر
  - `startDate` / `endDate`: بازه زمانی نمایش
  - `targetAudience`: مخاطب هدف (all, player, agent, super, admin)
  - `contentType`: نوع محتوا (text یا image)
  - `textContent`: محتوای متنی (اگر contentType = text)
  - `imageFile`: فایل تصویر (اگر contentType = image)
  - `requireConfirmation`: نیاز به تایید
  - `confirmationText`: متن تایید
- دکمه "ایجاد" برای ذخیره
- تصویر به Supabase Storage آپلود می‌شود (`banner-images` bucket)

---

#### 1.5.2. ویرایش بنر ورودی (`updateEntryBanner`)

**مسیر فایل:** `services/entry-banner.ts`  
**فراخوانی از:** `app/(admin)/admin/entry-banner/[bannerId]/page.tsx`  
**نوع عملیات:** UPDATE  
**جدول هدف:** `entry_banners`

**توضیح UI:**
- در صفحه ویرایش بنر (`/admin/entry-banner/[bannerId]`)
- همان فرم ایجاد بنر، اما با داده‌های موجود پیش‌پر شده
- دکمه "ذخیره" برای اعمال تغییرات
- اگر تصویر جدید آپلود شود، تصویر قدیمی از Storage حذف می‌شود

---

#### 1.5.3. حذف بنر ورودی (`deleteEntryBanner`)

**مسیر فایل:** `services/entry-banner.ts`  
**فراخوانی از:** `app/(admin)/admin/entry-banner/[bannerId]/page.tsx`  
**نوع عملیات:** DELETE  
**جدول هدف:** `entry_banners`

**توضیح UI:**
- در صفحه ویرایش بنر
- دکمه "حذف"
- پس از تایید، بنر و تصویر مرتبط از Storage حذف می‌شوند

---

### 1.6. عملیات روی جدول `user_notes`

#### 1.6.1. ذخیره یادداشت شخصی (`savePersonalNote`)

**مسیر فایل:** `services/user-account.ts`  
**فراخوانی از:** `components/admin/UserAccountPage.tsx`  
**نوع عملیات:** UPSERT  
**جدول هدف:** `user_notes` (ستون‌های `user_id`, `author_id`, `note`)

**توضیح UI:**
- در صفحه حساب کاربر
- دکمه "یادداشت شخصی" که یک modal باز می‌کند
- یک textarea برای نوشتن یادداشت (حداکثر 150 کاراکتر)
- نمایش تعداد کاراکترهای باقیمانده
- دکمه "ذخیره" برای ثبت یادداشت
- هر admin/agent/super یادداشت خودش را می‌نویسد (بر اساس `author_id`)

---

#### 1.6.2. حذف یادداشت شخصی (`deletePersonalNote`)

**مسیر فایل:** `services/user-account.ts`  
**فراخوانی از:** `components/admin/UserAccountPage.tsx`  
**نوع عملیات:** DELETE  
**جدول هدف:** `user_notes`

**توضیح UI:**
- در صفحه حساب کاربر
- در modal یادداشت شخصی، دکمه "حذف"
- فقط یادداشت نویسنده فعلی حذف می‌شود

---

### 1.7. عملیات RPC (Postgres Functions)

#### 1.7.1. تنظیم دستی موجودی کیف پول (`fn_adjust_wallet_manual`)

**مسیر فایل:** `services/transactions.ts` → `adjustWalletForUsersBulk`  
**فراخوانی از:** `components/admin/TransactionsManager.tsx`  
**نوع عملیات:** RPC  
**Function هدف:** `public.fn_adjust_wallet_manual`

**توضیح UI:**
- در صفحه مدیریت تراکنش‌ها (`/admin/transactions`)
- تب "پیشخوان" (Cashdesk)
- انتخاب کاربران (چندتایی)
- انتخاب نوع تراکنش (واریز یا برداشت)
- وارد کردن مبلغ
- دکمه "اعمال" برای انجام تراکنش

**وضعیت:**
- ✅ **این عملیات قبلاً به API route تبدیل شده است** (`/api/admin/wallet/adjust`)
- فرانت دیگر مستقیماً RPC را فراخوانی نمی‌کند

---

## 2. دسته‌بندی عملیات

### 2.1. عملیات بسیار حساس

این عملیات تأثیر مستقیم بر امنیت، اقتصاد، و ساختار سیستم دارند:

#### تغییر نقش و دسترسی‌ها
1. **`changeUserRole`** - تغییر نقش کاربر (player → agent/super/admin)
   - **ریسک:** بالا - تغییر ساختار سلسله‌مراتبی کاربران
   - **تأثیر:** تغییر `parent_id`, `role`, `admin_sub_role`, مدیریت `user_commissions`

2. **`changeAdminSubRole`** - تغییر sub-role مدیر
   - **ریسک:** بالا - تغییر دسترسی‌های مدیر
   - **تأثیر:** تغییر `admin_sub_role` که دسترسی به بخش‌های مختلف را کنترل می‌کند

3. **`updateAdminPermissions`** - تنظیم دسترسی‌های granular مدیر
   - **ریسک:** بالا - کنترل دسترسی به بخش‌های حساس سیستم
   - **تأثیر:** تغییر `admin_permissions` که دسترسی به rooms, users, transactions, entry_banner, admins را کنترل می‌کند

#### تعلیق/فعال‌سازی اکانت
4. **`toggleUserSuspension`** - تعلیق/فعال‌سازی کاربر
   - **ریسک:** متوسط-بالا - مسدود کردن دسترسی کاربر
   - **تأثیر:** تغییر `status` که دسترسی کاربر به سیستم را کنترل می‌کند

5. **`toggleAdminStatus`** - تعلیق/فعال‌سازی مدیر
   - **ریسک:** بالا - مسدود کردن دسترسی مدیر
   - **تأثیر:** تغییر `status` که دسترسی مدیر به سیستم را کنترل می‌کند

#### تنظیمات اقتصادی
6. **`saveUserCommission`** - تنظیم درصد کمیسیون agent/super
   - **ریسک:** بالا - تأثیر مستقیم بر اقتصاد سیستم
   - **تأثیر:** تغییر `agent_commission` یا `super_commission` که درآمد agent/super را تعیین می‌کند

7. **`saveRoomTemplate`** - ایجاد/ویرایش Room Template
   - **ریسک:** بالا - تأثیر مستقیم بر اقتصاد بازی
   - **تأثیر:** تغییر `price`, `line_reward_percentage`, `full_reward_percentage`, `commission_rate` که اقتصاد اتاق را تعیین می‌کند

8. **`deleteRoomTemplate`** - حذف Room Template
   - **ریسک:** متوسط-بالا - حذف تنظیمات اتاق
   - **تأثیر:** حذف template که ممکن است در حال استفاده باشد

---

### 2.2. عملیات کم‌خطرتر

این عملیات تأثیر کمتری بر امنیت و اقتصاد دارند:

#### مدیریت محتوا
1. **`createEntryBanner`** - ایجاد بنر ورودی
   - **ریسک:** پایین - فقط محتوای نمایشی
   - **تأثیر:** نمایش بنر به کاربران (بدون تأثیر بر اقتصاد یا امنیت)

2. **`updateEntryBanner`** - ویرایش بنر ورودی
   - **ریسک:** پایین - فقط محتوای نمایشی
   - **تأثیر:** تغییر محتوای بنر (بدون تأثیر بر اقتصاد یا امنیت)

3. **`deleteEntryBanner`** - حذف بنر ورودی
   - **ریسک:** پایین - فقط حذف محتوای نمایشی
   - **تأثیر:** حذف بنر (بدون تأثیر بر اقتصاد یا امنیت)

#### یادداشت‌های شخصی
4. **`savePersonalNote`** - ذخیره یادداشت شخصی
   - **ریسک:** پایین - فقط یادداشت شخصی admin/agent/super
   - **تأثیر:** ذخیره یادداشت برای مراجعه بعدی (بدون تأثیر بر سیستم)

5. **`deletePersonalNote`** - حذف یادداشت شخصی
   - **ریسک:** پایین - فقط حذف یادداشت شخصی
   - **تأثیر:** حذف یادداشت (بدون تأثیر بر سیستم)

---

## 3. خلاصه و نقشه نهایی

### 3.1. جدول عملیات حساس

| # | عملیات | فایل Service | فایل Component/Page | نوع عملیات | جدول/Function | سطح ریسک |
|---|--------|--------------|---------------------|------------|---------------|-----------|
| 1 | تغییر نقش کاربر | `services/user-account.ts` | `components/admin/UserAccountPage.tsx` | UPDATE + UPSERT | `users`, `user_commissions` | 🔴 بسیار حساس |
| 2 | تعلیق/فعال‌سازی کاربر | `services/user-account.ts` | `components/admin/UserAccountPage.tsx` | UPDATE | `users` | 🟠 بسیار حساس |
| 3 | تغییر sub-role مدیر | `services/admins.ts` | `components/admin/AdminsList.tsx` | UPDATE | `users` | 🔴 بسیار حساس |
| 4 | تعلیق/فعال‌سازی مدیر | `services/admins.ts` | `components/admin/AdminsList.tsx` | UPDATE | `users` | 🔴 بسیار حساس |
| 5 | تنظیم دسترسی‌های مدیر | `services/admins.ts` | `components/admin/AdminsList.tsx` | DELETE + INSERT | `admin_permissions` | 🔴 بسیار حساس |
| 6 | تنظیم درصد کمیسیون | `services/user-account.ts` | `components/admin/UserAccountPage.tsx` | UPSERT | `user_commissions` | 🔴 بسیار حساس |
| 7 | ایجاد/ویرایش Room Template | `services/rooms.ts` | `app/(admin)/room-templates/page.tsx` | INSERT/UPDATE | `room_templates` | 🔴 بسیار حساس |
| 8 | حذف Room Template | `services/rooms.ts` | `app/(admin)/room-templates/page.tsx` | DELETE | `room_templates` | 🟠 بسیار حساس |
| 9 | ایجاد بنر ورودی | `services/entry-banner.ts` | `app/(admin)/admin/entry-banner/create/page.tsx` | INSERT | `entry_banners` | 🟢 کم‌خطر |
| 10 | ویرایش بنر ورودی | `services/entry-banner.ts` | `app/(admin)/admin/entry-banner/[bannerId]/page.tsx` | UPDATE | `entry_banners` | 🟢 کم‌خطر |
| 11 | حذف بنر ورودی | `services/entry-banner.ts` | `app/(admin)/admin/entry-banner/[bannerId]/page.tsx` | DELETE | `entry_banners` | 🟢 کم‌خطر |
| 12 | ذخیره یادداشت شخصی | `services/user-account.ts` | `components/admin/UserAccountPage.tsx` | UPSERT | `user_notes` | 🟢 کم‌خطر |
| 13 | حذف یادداشت شخصی | `services/user-account.ts` | `components/admin/UserAccountPage.tsx` | DELETE | `user_notes` | 🟢 کم‌خطر |

### 3.2. عملیات RPC

| # | عملیات | فایل Service | فایل Component/Page | نوع عملیات | Function | وضعیت |
|---|--------|--------------|---------------------|------------|----------|-------|
| 1 | تنظیم دستی موجودی | `services/transactions.ts` | `components/admin/TransactionsManager.tsx` | RPC | `fn_adjust_wallet_manual` | ✅ **تبدیل شده به API route** |

---

## 4. اولویت‌بندی برای مهاجرت به API Routes

### 4.1. اولویت بالا (باید فوراً پشت API route منتقل شوند)

1. **`changeUserRole`** - تغییر نقش کاربر
   - تأثیر بر ساختار سلسله‌مراتبی
   - نیاز به validation پیچیده
   - مدیریت `user_commissions` باید اتمیک باشد

2. **`changeAdminSubRole`** - تغییر sub-role مدیر
   - تأثیر بر دسترسی‌های مدیر
   - فقط مدیر کل باید بتواند انجام دهد

3. **`updateAdminPermissions`** - تنظیم دسترسی‌های مدیر
   - کنترل دسترسی به بخش‌های حساس
   - فقط مدیر کل باید بتواند انجام دهد

4. **`saveUserCommission`** - تنظیم درصد کمیسیون
   - تأثیر مستقیم بر اقتصاد
   - نیاز به validation (0-100)

5. **`saveRoomTemplate`** - ایجاد/ویرایش Room Template
   - تأثیر مستقیم بر اقتصاد بازی
   - نیاز به validation پیچیده (مثلاً `commission_rate` باید بین 0-1 باشد)

### 4.2. اولویت متوسط

6. **`toggleUserSuspension`** - تعلیق/فعال‌سازی کاربر
   - تأثیر بر دسترسی کاربر
   - نیاز به لاگ‌گیری

7. **`toggleAdminStatus`** - تعلیق/فعال‌سازی مدیر
   - تأثیر بر دسترسی مدیر
   - نیاز به لاگ‌گیری

8. **`deleteRoomTemplate`** - حذف Room Template
   - نیاز به بررسی استفاده (آیا template در حال استفاده است؟)

### 4.3. اولویت پایین (می‌تواند بعداً منتقل شود)

9. **`createEntryBanner`** - ایجاد بنر ورودی
10. **`updateEntryBanner`** - ویرایش بنر ورودی
11. **`deleteEntryBanner`** - حذف بنر ورودی
12. **`savePersonalNote`** - ذخیره یادداشت شخصی
13. **`deletePersonalNote`** - حذف یادداشت شخصی

---

## 5. نکات مهم

### 5.1. امنیت

- **تمام عملیات حساس باید پشت API routes منتقل شوند** تا:
  - Authentication/Authorization در server-side انجام شود
  - Validation در server-side انجام شود
  - Audit logging انجام شود
  - Rate limiting اعمال شود

### 5.2. یکپارچگی داده

- عملیات‌هایی که چند جدول را تغییر می‌دهند (مثلاً `changeUserRole` که `users` و `user_commissions` را تغییر می‌دهد) باید در یک transaction انجام شوند
- این کار در API routes با استفاده از `supabaseServer` (service_role) امکان‌پذیر است

### 5.3. Backward Compatibility

- پس از تبدیل به API routes، باید اطمینان حاصل شود که:
  - RLS policies همچنان کار می‌کنند
  - توابع Postgres (مثل `fn_adjust_wallet_manual`) همچنان از طریق API routes قابل دسترسی هستند
  - هیچ breaking change در UI وجود ندارد

---

## وضعیت پس از فاز ۴

**تاریخ به‌روزرسانی:** 2025-01-27

### عملیات‌های مهاجرت شده به Admin API

✅ **تمام عملیات زیر اکنون از Admin API استفاده می‌کنند:**

1. **تغییر نقش کاربر** (`changeUserRole`)
   - **API Route:** `POST /api/admin/users/set-role`
   - **Service:** `services/user-account.ts` → از `lib/adminApiClient.ts` استفاده می‌کند
   - **Component:** `components/admin/UserAccountPage.tsx`

2. **تغییر sub-role مدیر** (`changeAdminSubRole`)
   - **API Route:** `POST /api/admin/admins/set-sub-role`
   - **Service:** `services/admins.ts` → از `lib/adminApiClient.ts` استفاده می‌کند
   - **Component:** `components/admin/AdminsList.tsx`

3. **تعلیق/فعال‌سازی کاربر** (`toggleUserSuspension`)
   - **API Route:** `POST /api/admin/users/toggle-suspension`
   - **Service:** `services/user-account.ts` → از `lib/adminApiClient.ts` استفاده می‌کند
   - **Component:** `components/admin/UserAccountPage.tsx`

4. **تعلیق/فعال‌سازی مدیر** (`toggleAdminStatus`)
   - **API Route:** `POST /api/admin/admins/toggle-status`
   - **Service:** `services/admins.ts` → از `lib/adminApiClient.ts` استفاده می‌کند
   - **Component:** `components/admin/AdminsList.tsx`

### تغییرات کلیدی

#### 1. حذف Direct Database Access

- ❌ **قبل:** فرانت مستقیماً `supabase.from('users').update(...)` را فراخوانی می‌کرد
- ✅ **بعد:** فرانت از Admin API routes استفاده می‌کند
- ✅ **نتیجه:** تمام write operations روی `users` (برای این 4 عملیات) از طریق API انجام می‌شوند

#### 2. Helper Functions

- **`lib/adminApiClient.ts`** ایجاد شد:
  - `callAdminApi()`: helper عمومی برای فراخوانی Admin API
  - `setUserRole()`: wrapper برای تغییر نقش
  - `setAdminSubRole()`: wrapper برای تغییر sub-role
  - `toggleUserSuspension()`: wrapper برای تعلیق کاربر
  - `toggleAdminStatus()`: wrapper برای تعلیق مدیر
  - `AdminApiError`: کلاس خطا برای مدیریت خطاهای API

#### 3. Refactoring Services

- **`services/user-account.ts`:**
  - `changeUserRole()`: اکنون از `setUserRole()` از `adminApiClient` استفاده می‌کند
  - `toggleUserSuspension()`: اکنون از `toggleUserSuspension()` از `adminApiClient` استفاده می‌کند
  - تمام منطق validation و business rules به API route منتقل شد

- **`services/admins.ts`:**
  - `changeAdminSubRole()`: اکنون از `setAdminSubRole()` از `adminApiClient` استفاده می‌کند
  - `toggleAdminStatus()`: اکنون از `toggleAdminStatus()` از `adminApiClient` استفاده می‌کند
  - تمام منطق validation و business rules به API route منتقل شد

#### 4. حفظ Backward Compatibility

- ✅ **Interface services تغییر نکرده است:**
  - `changeUserRole()` همچنان `{ success: boolean; error?: string }` برمی‌گرداند
  - `toggleUserSuspension()` همچنان `{ success: boolean; newStatus: ...; error?: string }` برمی‌گرداند
  - `changeAdminSubRole()` و `toggleAdminStatus()` نیز همین‌طور
- ✅ **Components نیازی به تغییر ندارند:**
  - تمام components همچنان از همان service functions استفاده می‌کنند
  - فقط implementation داخلی تغییر کرده است

### امنیت

✅ **تمام عملیات حساس اکنون:**
- از طریق API routes انجام می‌شوند (server-side)
- با `service_role` key اجرا می‌شوند
- در `admin_audit_log` ثبت می‌شوند
- با validation و authorization مناسب محافظت می‌شوند

### بررسی Direct Writes

✅ **بررسی انجام شد:**
- هیچ `supabase.from('users').update()` در `services/` برای این 4 عملیات وجود ندارد
- هیچ `supabase.from('users').update()` در `components/admin/` برای این 4 عملیات وجود ندارد
- تمام write operations از طریق Admin API انجام می‌شوند

### قدم بعدی

⏳ **عملیات‌های باقی‌مانده برای مهاجرت:**
- `saveUserCommission` → `POST /api/admin/users/set-commission` (در فاز بعدی)
- `saveRoomTemplate` → `POST /api/admin/rooms/template` (در فاز بعدی)
- `deleteRoomTemplate` → `DELETE /api/admin/rooms/template/{id}` (در فاز بعدی)
- `updateAdminPermissions` → `POST /api/admin/admins/set-permissions` (در فاز بعدی)

---

**پایان سند**

