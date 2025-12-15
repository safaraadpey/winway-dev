# عملیات حساس ادمین - لیست کامل

**تاریخ تولید:** 2025-01-XX  
**هدف:** شناسایی تمام عملیات حساس که از فرانت‌اند (React components/pages) روی جداول حساس انجام می‌شود

---

## جدول عملیات حساس

| # | مسیر فایل | نوع عملیات | جدول/تابع | توضیحات UI |
|---|-----------|------------|-----------|------------|
| 1 | `services/transactions.ts` | RPC | `fn_adjust_wallet_manual` | واریز/برداشت دستی موجودی کیف پول کاربران - از پنل تراکنش‌ها (`/admin/transactions`) |
| 2 | `services/user-account.ts` | UPDATE | `users` | تغییر نقش کاربر (player → agent/super/admin) - از صفحه حساب کاربر (`/admin/users/[userId]`) |
| 3 | `services/user-account.ts` | UPDATE | `users` | تعلیق/فعال‌سازی اکانت کاربر (تغییر `status`) - از صفحه حساب کاربر |
| 4 | `services/user-account.ts` | UPDATE | `user_commissions` | تغییر درصد کمیسیون agent/super - از صفحه حساب کاربر |
| 5 | `services/user-account.ts` | INSERT/UPDATE | `user_notes` | ایجاد/ویرایش یادداشت شخصی درباره کاربر - از صفحه حساب کاربر |
| 6 | `services/user-account.ts` | DELETE | `user_notes` | حذف یادداشت شخصی - از صفحه حساب کاربر |
| 7 | `services/admins.ts` | UPDATE | `users` | تغییر `admin_sub_role` مدیر - از صفحه مدیریت مدیران (`/admin/admins`) |
| 8 | `services/admins.ts` | UPDATE | `users` | تعلیق/فعال‌سازی اکانت مدیر (تغییر `status`) - از صفحه مدیریت مدیران |
| 9 | `services/admins.ts` | INSERT/UPDATE/DELETE | `admin_permissions` | تنظیم دسترسی‌های مدیر (rooms, users, transactions, entry_banner, admins) - از صفحه مدیریت مدیران |
| 10 | `services/rooms.ts` | UPDATE | `room_templates` | ویرایش Room Template - از صفحه مدیریت Room Templates (`/admin/room-templates`) |
| 11 | `services/rooms.ts` | INSERT | `room_templates` | ایجاد Room Template جدید - از صفحه مدیریت Room Templates |
| 12 | `services/rooms.ts` | DELETE | `room_templates` | حذف Room Template - از صفحه مدیریت Room Templates |
| 13 | `services/entry-banner.ts` | INSERT | `entry_banners` | ایجاد بنر ورودی جدید - از صفحه مدیریت بنرها (`/admin/entry-banner/create`) |
| 14 | `services/entry-banner.ts` | UPDATE | `entry_banners` | ویرایش بنر موجود - از صفحه ویرایش بنر (`/admin/entry-banner/[bannerId]`) |
| 15 | `services/entry-banner.ts` | DELETE | `entry_banners` | حذف بنر - از صفحه ویرایش بنر |
| 16 | `services/entry-banner.ts` | Storage Upload | `banner-images` (Supabase Storage) | آپلود تصویر بنر - از صفحات ایجاد/ویرایش بنر |

---

## جزئیات هر عملیات

### 1. واریز/برداشت دستی موجودی (`fn_adjust_wallet_manual`)

**فایل:** `services/transactions.ts`  
**تابع:** `adjustWalletForUsersBulk()`  
**نوع:** RPC call  
**UI:** `components/admin/TransactionsManager.tsx` → تب "پیشخوان" → دکمه "واریز" یا "برداشت"

**جزئیات:**
- فراخوانی RPC `fn_adjust_wallet_manual` برای هر کاربر انتخاب شده
- امکان bulk operation (چند کاربر همزمان)
- تغییر مستقیم موجودی `wallets` و ثبت در `transactions`

**خطر:** ⚠️ **بسیار حساس** - دستکاری مستقیم پول

---

### 2. تغییر نقش کاربر

**فایل:** `services/user-account.ts`  
**تابع:** `changeUserRole()`  
**نوع:** UPDATE روی `users.role` و `users.admin_sub_role`  
**UI:** `components/admin/UserAccountPage.tsx` → بخش "نقش" → dropdown

**جزئیات:**
- تغییر `users.role` (player/agent/super/admin)
- تغییر `users.admin_sub_role` (اگر به admin تبدیل شود)
- مدیریت `user_commissions` بر اساس نقش جدید
- قوانین دسترسی: فقط admin می‌تواند به super/admin تبدیل کند

**خطر:** ⚠️ **بسیار حساس** - تغییر دسترسی کاربر

---

### 3. تعلیق/فعال‌سازی اکانت کاربر

**فایل:** `services/user-account.ts`  
**تابع:** `toggleUserSuspension()`  
**نوع:** UPDATE روی `users.status`  
**UI:** `components/admin/UserAccountPage.tsx` → دکمه "تعلیق اکانت" / "فعال‌سازی اکانت"

**جزئیات:**
- تغییر `users.status` بین `active` و `suspended`
- کاربر تعلیق شده نمی‌تواند لاگین کند

**خطر:** ⚠️ **حساس** - مسدود کردن دسترسی کاربر

---

### 4. تغییر درصد کمیسیون

**فایل:** `services/user-account.ts`  
**تابع:** `saveUserCommission()`  
**نوع:** UPDATE روی `user_commissions`  
**UI:** `components/admin/UserAccountPage.tsx` → بخش "درصد کانیات" → input + دکمه "ثبت"

**جزئیات:**
- تغییر `user_commissions.agent_commission` یا `user_commissions.super_commission`
- فقط برای role=agent یا role=super

**خطر:** ⚠️ **حساس** - تغییر درآمد agent/super

---

### 5-6. مدیریت یادداشت شخصی

**فایل:** `services/user-account.ts`  
**توابع:** `savePersonalNote()`, `deletePersonalNote()`  
**نوع:** INSERT/UPDATE/DELETE روی `user_notes`  
**UI:** `components/admin/UserAccountPage.tsx` → بخش "یادداشت شخصی" → modal

**جزئیات:**
- ایجاد/ویرایش/حذف یادداشت 150 کاراکتری درباره کاربر
- هر admin/agent/super می‌تواند یادداشت خودش را بنویسد

**خطر:** ⚠️ **کم حساس** - فقط اطلاعات متنی

---

### 7. تغییر admin_sub_role

**فایل:** `services/admins.ts`  
**تابع:** `changeAdminSubRole()`  
**نوع:** UPDATE روی `users.admin_sub_role`  
**UI:** `components/admin/AdminsList.tsx` → dropdown "نقش" برای هر مدیر

**جزئیات:**
- تغییر `users.admin_sub_role` (manager/finance/support/room)
- فقط مدیر کل (admin_sub_role = null) می‌تواند این کار را انجام دهد

**خطر:** ⚠️ **بسیار حساس** - تغییر دسترسی مدیر

---

### 8. تعلیق/فعال‌سازی مدیر

**فایل:** `services/admins.ts`  
**تابع:** `toggleAdminStatus()`  
**نوع:** UPDATE روی `users.status`  
**UI:** `components/admin/AdminsList.tsx` → دکمه "تعلیق" / "فعال‌سازی"

**جزئیات:**
- تغییر `users.status` برای مدیران
- فقط مدیر کل می‌تواند این کار را انجام دهد

**خطر:** ⚠️ **بسیار حساس** - مسدود کردن دسترسی مدیر

---

### 9. تنظیم دسترسی‌های مدیر

**فایل:** `services/admins.ts`  
**تابع:** `updateAdminPermissions()`  
**نوع:** INSERT/UPDATE/DELETE روی `admin_permissions`  
**UI:** `components/admin/AdminsList.tsx` → دکمه "دسترسی‌ها" → modal با toggle switches

**جزئیات:**
- تنظیم دسترسی‌های granular برای مدیران (rooms, users, transactions, entry_banner, admins)
- فقط مدیر کل می‌تواند این کار را انجام دهد

**خطر:** ⚠️ **بسیار حساس** - تغییر دسترسی‌های granular مدیر

---

### 10-12. مدیریت Room Templates

**فایل:** `services/rooms.ts`  
**توابع:** `saveRoomTemplate()`, `deleteRoomTemplate()`  
**نوع:** INSERT/UPDATE/DELETE روی `room_templates`  
**UI:** `components/admin/RoomTemplatePanel.tsx` → دکمه‌های "ذخیره" و "حذف"

**جزئیات:**
- ایجاد/ویرایش/حذف Room Template
- تغییر قیمت، کمیسیون، reward percentages و سایر تنظیمات اتاق

**خطر:** ⚠️ **حساس** - تغییر اقتصاد بازی

---

### 13-15. مدیریت Entry Banners

**فایل:** `services/entry-banner.ts`  
**توابع:** `createEntryBanner()`, `updateEntryBanner()`, `deleteEntryBanner()`  
**نوع:** INSERT/UPDATE/DELETE روی `entry_banners`  
**UI:** صفحات `/admin/entry-banner/create` و `/admin/entry-banner/[bannerId]`

**جزئیات:**
- ایجاد/ویرایش/حذف بنرهای ورودی
- تنظیم target audience، تاریخ نمایش، محتوا (متن/تصویر)

**خطر:** ⚠️ **کم حساس** - فقط محتوای نمایشی

---

### 16. آپلود تصویر بنر

**فایل:** `services/entry-banner.ts`  
**تابع:** `uploadBannerImage()`  
**نوع:** Upload به Supabase Storage (`banner-images`)  
**UI:** صفحات ایجاد/ویرایش بنر → انتخاب فایل تصویر

**جزئیات:**
- آپلود تصویر به Supabase Storage
- Validation: max 1MB, max 1000x1300px

**خطر:** ⚠️ **کم حساس** - فقط فایل‌های استاتیک

---

## عملیات‌های خواندن (SELECT) - کمتر حساس

این عملیات‌ها فقط خواندن هستند و تغییر در دیتابیس ایجاد نمی‌کنند:

| فایل | جدول | توضیحات |
|------|------|---------|
| `services/transactions.ts` | `transactions` | خواندن تاریخچه تراکنش‌های manual_panel |
| `services/users.ts` | `wallets` | خواندن موجودی کیف‌پول کاربران |
| `services/user-account.ts` | `wallets`, `transactions` | خواندن موجودی و تراکنش‌های کاربر |
| `services/rooms.ts` | `rooms`, `tickets` | خواندن اطلاعات room و tickets |
| `services/entry-banner.ts` | `entry_banners` | خواندن لیست بنرها |

---

## خلاصه اولویت‌بندی

### 🔴 بسیار حساس (اولویت بالا)
1. **واریز/برداشت دستی** (`fn_adjust_wallet_manual`) - دستکاری مستقیم پول
2. **تغییر نقش کاربر** - تغییر دسترسی کاربر
3. **تغییر admin_sub_role** - تغییر دسترسی مدیر
4. **تعلیق مدیر** - مسدود کردن دسترسی مدیر
5. **تنظیم permissions مدیر** - تغییر دسترسی‌های granular

### 🟡 حساس (اولویت متوسط)
6. **تعلیق کاربر** - مسدود کردن دسترسی کاربر
7. **تغییر کمیسیون** - تغییر درآمد agent/super
8. **مدیریت Room Templates** - تغییر اقتصاد بازی

### 🟢 کم حساس (اولویت پایین)
9. **مدیریت یادداشت شخصی** - فقط اطلاعات متنی
10. **مدیریت Entry Banners** - فقط محتوای نمایشی
11. **آپلود تصویر** - فقط فایل‌های استاتیک

---

**پایان سند**

