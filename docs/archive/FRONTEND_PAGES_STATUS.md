# وضعیت صفحات فرانت‌اند

## 📋 خلاصه

| دسته | تعداد صفحات | آماده | در حال توسعه |
|------|-------------|-------|--------------|
| **Authentication** | 4 | 4 | 0 |
| **Player Pages** | 7 | 2 | 5 |
| **Game Pages** | 2 | 1 | 1 |
| **Admin/Agent** | 2 | 0 | 2 |
| **Utility** | 2 | 2 | 0 |
| **جمع کل** | **17** | **9** | **8** |

---

## ✅ صفحات آماده (9 صفحه)

### 🔐 Authentication (4 صفحه)

#### 1. **صفحه اصلی (Root)** - `/`
- **فایل:** `app/page.tsx`
- **وضعیت:** ✅ آماده
- **عملکرد:** بررسی لاگین و هدایت به `/post-login` یا `/auth/login`
- **ویژگی‌ها:**
  - بررسی session با Supabase
  - نمایش loading
  - هدایت خودکار

#### 2. **صفحه لاگین** - `/auth/login`
- **فایل:** `app/(auth)/login/page.tsx`
- **وضعیت:** ✅ آماده
- **عملکرد:** ورود کاربر
- **ویژگی‌ها:**
  - فرم لاگین با email/password
  - نمایش/مخفی کردن رمز عبور
  - لینک فراموشی رمز
  - لینک ثبت‌نام
  - هدایت به `/post-login` بعد از لاگین موفق

#### 3. **صفحه ثبت‌نام** - `/auth/signup`
- **فایل:** `app/(auth)/signup/page.tsx`
- **وضعیت:** ✅ آماده (احتمالاً مشابه login)
- **عملکرد:** ثبت‌نام کاربر جدید

#### 4. **صفحه احراز هویت عمومی** - `/(public)/auth`
- **فایل:** `app/(public)/auth/page.tsx`
- **وضعیت:** ✅ آماده
- **عملکرد:** صفحه لاگین/ثبت‌نام ترکیبی
- **ویژگی‌ها:**
  - قابلیت جابجایی بین لاگین و ثبت‌نام
  - فرم کامل با validation

#### 5. **صفحه بازیابی رمز** - `/auth/recovery`
- **فایل:** `app/(auth)/recovery/page.tsx`
- **وضعیت:** ✅ آماده
- **عملکرد:** بازیابی رمز عبور فراموش شده
- **ویژگی‌ها:**
  - ارسال لینک بازیابی به ایمیل
  - نمایش پیام موفقیت
  - لینک بازگشت به لاگین

---

### 🎮 Player Pages (2 صفحه)

#### 6. **صفحه اصلی بازیکن** - `/player/home`
- **فایل:** `app/player/home/page.tsx`
- **وضعیت:** ✅ آماده
- **Screen:** `MainMenuScreen.tsx`
- **عملکرد:** منوی اصلی بازیکن
- **ویژگی‌ها:**
  - لینک به Game Room
  - لینک به Leaderboard (بدون لینک)
  - لینک به My Profile (بدون لینک)
  - لینک به Reports (بدون لینک)
  - دکمه Logout (بدون عملکرد)
  - استفاده از تصاویر منو

#### 7. **صفحه Game Room** - `/player/gameroom`
- **فایل:** `app/player/gameroom/page.tsx`
- **وضعیت:** ✅ آماده
- **Screen:** `GameRoomScreen.tsx`
- **عملکرد:** انتخاب کارت و مشاهده میزهای فعال
- **ویژگی‌ها:**
  - شمارش معکوس بازی
  - انتخاب تعداد کارت
  - نمایش کارت‌های فعال
  - نمایش میزهای فعال
  - غیرفعال کردن اسکرول

---

### 🎯 Utility Pages (2 صفحه)

#### 8. **صفحه Post-Login** - `/post-login`
- **فایل:** `app/post-login/page.tsx`
- **وضعیت:** ✅ آماده
- **عملکرد:** هدایت بر اساس نقش کاربر
- **ویژگی‌ها:**
  - بررسی نقش از `user_metadata` یا `profiles`
  - هدایت به:
    - `/admin/dashboard` برای admin/super
    - `/agent/dashboard` برای agent
    - `/player/home` برای player (پیش‌فرض)

#### 9. **صفحه بازی (Room)** - `/game/room/[roomId]`
- **فایل:** `app/(game)/room/[roomId]/page.tsx`
- **وضعیت:** ✅ آماده (ساده)
- **عملکرد:** نمایش کارت Bingo
- **ویژگی‌ها:**
  - استفاده از کامپوننت `BingoCard`
  - نمایش Room ID

---

## 🚧 صفحات در حال توسعه (8 صفحه)

### 🎮 Player Pages (5 صفحه)

#### 10. **صفحه Leaderboard** - `/player/leaderboard`
- **فایل:** `app/player/leaderboard/page.tsx`
- **وضعیت:** 🚧 در حال توسعه
- **عملکرد:** نمایش جدول امتیازات
- **نکته:** Function های backend آماده است (`get_daily_leaders`, `get_weekly_leaders`)

#### 11. **صفحه Wallet** - `/player/wallet`
- **فایل:** `app/player/wallet/page.tsx`
- **وضعیت:** 🚧 در حال توسعه
- **عملکرد:** مدیریت کیف پول بازیکن

#### 12. **صفحه My Profile** - `/player/myprofile`
- **فایل:** `app/player/myprofile/page.tsx`
- **وضعیت:** 🚧 در حال توسعه
- **عملکرد:** نمایش و ویرایش پروفایل بازیکن

#### 13. **صفحه Reports** - `/player/reports`
- **فایل:** `app/player/reports/page.tsx`
- **وضعیت:** 🚧 در حال توسعه
- **عملکرد:** گزارش‌های مالی بازیکن

#### 14. **صفحه Rules** - `/player/rules`
- **فایل:** `app/player/rules/page.tsx`
- **وضعیت:** 🚧 در حال توسعه
- **عملکرد:** نمایش قوانین بازی

---

### 🎯 Game Pages (1 صفحه)

#### 15. **صفحه Lobby** - `/game/lobby`
- **فایل:** `app/(game)/lobby/page.tsx`
- **وضعیت:** 🚧 در حال توسعه
- **عملکرد:** لابی بازی‌ها

---

### 👨‍💼 Admin/Agent Pages (2 صفحه)

#### 16. **داشبورد ادمین** - `/admin/dashboard`
- **فایل:** `app/(admin)/dashboard/page.tsx`
- **وضعیت:** 🚧 در حال توسعه
- **عملکرد:** داشبورد مدیریت

#### 17. **داشبورد ایجنت** - `/agent/dashboard`
- **فایل:** `app/(agent)/dashboard/page.tsx`
- **وضعیت:** 🚧 در حال توسعه
- **عملکرد:** داشبورد ایجنت

---

## 📊 آمار صفحات

### بر اساس وضعیت:
- ✅ **آماده:** 9 صفحه (53%)
- 🚧 **در حال توسعه:** 8 صفحه (47%)

### بر اساس دسته:
- **Authentication:** 4/4 آماده (100%)
- **Player Pages:** 2/7 آماده (29%)
- **Game Pages:** 1/2 آماده (50%)
- **Admin/Agent:** 0/2 آماده (0%)
- **Utility:** 2/2 آماده (100%)

---

## 🔗 مسیرهای Navigation

### Player Flow:
```
/ → /post-login → /player/home
                    ├─ /player/gameroom ✅
                    ├─ /player/leaderboard 🚧
                    ├─ /player/myprofile 🚧
                    ├─ /player/reports 🚧
                    └─ /player/wallet 🚧
```

### Game Flow:
```
/player/gameroom → /game/room/[roomId] ✅
                  └─ /game/lobby 🚧
```

### Admin/Agent Flow:
```
/post-login → /admin/dashboard 🚧
            └─ /agent/dashboard 🚧
```

---

## 📝 نکات مهم

1. **Authentication:** سیستم لاگین و ثبت‌نام کامل است
2. **Role-based Routing:** `/post-login` برای هدایت بر اساس نقش آماده است
3. **Main Menu:** منوی اصلی بازیکن با تصاویر آماده است
4. **Game Room:** صفحه انتخاب کارت و میزهای فعال آماده است
5. **Backend Ready:** Function های Leaderboard در backend آماده است

---

## 🎯 اولویت‌های توسعه

### اولویت بالا:
1. **Leaderboard** - Backend آماده است، فقط UI نیاز دارد
2. **Game Room Integration** - اتصال به API برای کارت‌ها و میزها
3. **Wallet** - مدیریت کیف پول

### اولویت متوسط:
4. **My Profile** - نمایش و ویرایش پروفایل
5. **Reports** - گزارش‌های مالی
6. **Rules** - نمایش قوانین

### اولویت پایین:
7. **Admin Dashboard** - داشبورد مدیریت
8. **Agent Dashboard** - داشبورد ایجنت
9. **Lobby** - لابی بازی‌ها

