# 🏗️ پلن معماری فیچر-محور برای DingMoney

## 📋 وضعیت فعلی پروژه

### صفحات موجود:
- `app/(public)/auth/page.tsx` → احراز هویت (login/signup)
- `app/(protected)/lobby/page.tsx` → منوی اصلی (استفاده از MainMenuScreen)
- `app/(protected)/game/[roomId]/page.tsx` → صفحه بازی
- `app/test-connection/page.tsx` → صفحه تست اتصال
- `app/page.tsx` → صفحه اصلی (home)

### کامپوننت‌های موجود:
- `components/DingHeader.tsx` - هدر با لوگو و موجودی Ding
- `components/DingBalanceCapsule.tsx` - کپسول موجودی Ding
- `components/PlayerStatusBar.tsx` - نمایش بازیکن + موجودی تومان
- `components/BingoCard.tsx` - کارت بازی
- `components/BalanceBar.tsx` - (قدیمی، باید حذف شود)

### فایل‌های lib:
- `lib/supabaseClient.ts`
- `lib/ding.ts`
- `lib/leaderboard.ts`
- `lib/hooks/useWalletBalances.ts`
- `lib/contexts/HeaderVisibilityContext.tsx`

---

## 🎯 ساختار پیشنهادی (فیچر-محور)

> نکته: این ساختار هدف است؛ پیاده‌سازی نهایی باید با وضعیت فعلی پروژه sync شود و در صورت نیاز جزئیات آن تنظیم گردد.  

> **در این فاز، هیچ تغییری در دیتابیس انجام نشود.**

### ساختار پوشه‌های App Router:

```
app/
├── layout.tsx                          # Root layout (theme, providers)
├── page.tsx                            # Redirect به /auth یا /player/home (بر اساس session)
├── globals.css
│
├── (public)/                           # 🌐 صفحات عمومی (اختیاری / در صورت نیاز)
│   ├── landing/
│   │   └── page.tsx                    # صفحه فرود (Landing)
│   ├── about/
│   │   └── page.tsx                    # درباره بازی / پلتفرم
│   └── rules/
│       └── page.tsx                    # قوانین بازی
│
├── (auth)/                             # 🔐 احراز هویت
│   ├── layout.tsx                      # Layout بدون DingHeader
│   ├── login/
│   │   └── page.tsx                    # صفحه ورود
│   ├── signup/
│   │   └── page.tsx                    # صفحه ثبت‌نام
│   └── recovery/
│       └── page.tsx                    # بازیابی رمز عبور
│
├── (player)/                           # 👤 بخش پلیر (کاربر عادی)
│   ├── layout.tsx                      # Layout با DingHeader + امکان استفاده از PlayerStatusBar (opt-in)
│   ├── home/
│   │   └── page.tsx                    # منوی اصلی / داشبورد پلیر (جایگزین lobby)
│   ├── profile/
│   │   └── page.tsx                    # پروفایل بازیکن
│   └── leaderboard/
│       └── page.tsx                    # لیدربورد بازیکنان (اگر بازیکن‌محور باشد)
│
├── (game)/                             # 🎮 بخش بازی
│   ├── layout.tsx                      # Layout مخصوص بازی (با DingHeader، بدون PlayerStatusBar به‌صورت پیش‌فرض)
│   ├── lobby/
│   │   └── page.tsx                    # لابی بازی‌ها (انتخاب روم، مودها و ...)
│   ├── room/
│   │   └── [roomId]/
│   │       └── page.tsx                # اتاق بازی
│   ├── results/
│   │   └── [roomId]/
│   │       └── page.tsx                # نتایج بازی
│   └── leaderboard/
│       └── page.tsx                    # لیدربورد بازی‌ها (اگر بازی‌محور باشد)
│
├── (wallet)/                           # 💰 کیف پول
│   ├── layout.tsx                      # Layout با DingHeader (در صورت نیاز) – می‌تواند از layout پلیر reuse شود
│   ├── page.tsx                        # صفحه اصلی کیف پول
│   ├── deposit/
│   │   └── page.tsx                    # واریز
│   └── withdraw/
│       └── page.tsx                    # برداشت
│
├── (ding)/                             # 🪙 سیستم Ding (امتیاز)
│   ├── layout.tsx                      # Layout با DingHeader (در صورت نیاز) – یا reuse از player/game
│   ├── page.tsx                        # صفحه اصلی Ding
│   ├── history/
│   │   └── page.tsx                    # تاریخچه تراکنش‌های Ding
│   ├── rewards/
│   │   └── page.tsx                    # پاداش‌ها
│   └── leaderboard/
│       └── page.tsx                    # لیدربورد Ding (بر اساس مقدار Ding)
│
├── (messages)/                         # 💬 پیام‌ها / نوتیفیکیشن‌ها
│   ├── layout.tsx                      # Layout با DingHeader
│   └── page.tsx                        # لیست پیام‌ها / Inbox
│
├── (settings)/                         # ⚙️ تنظیمات
│   ├── layout.tsx                      # Layout با DingHeader
│   ├── page.tsx                        # تنظیمات اصلی کاربر
│   └── test-connection/
│       └── page.tsx                    # تست اتصال (برای dev)
│
├── (admin)/                            # 🛠️ پنل ادمین / سوپر
│   ├── layout.tsx                      # Layout مخصوص admin/super (بدون PlayerStatusBar، با ناوبری مدیریتی)
│   ├── dashboard/
│   │   └── page.tsx                    # داشبورد اصلی ادمین
│   ├── rooms/
│   │   └── page.tsx                    # مدیریت روم‌ها / بازی‌ها
│   ├── users/
│   │   └── page.tsx                    # مدیریت کاربران
│   └── reports/
│       └── page.tsx                    # گزارش‌ها، آمارها
│
└── (agent)/                            # 🤝 پنل ایجنت / سوپرایجنت (در صورت نیاز به UI جدا)
    ├── layout.tsx                      # Layout مخصوص agent (ممکن است سبک‌تر از admin باشد)
    └── dashboard/
        └── page.tsx                    # داشبورد ایجنت (کدها، زیرمجموعه‌ها، درآمد)
```

---

## 🧩 ساختار Components

```
components/
├── DingHeader.tsx                      # هدر با لوگو + موجودی Ding (بدون تومان)
├── DingHeader.module.css
├── DingBalanceCapsule.tsx              # کپسول موجودی Ding
├── DingBalanceCapsule.module.css
├── PlayerStatusBar.tsx                 # نوار وضعیت بازیکن (آواتار + نام + موجودی تومان)
├── PlayerStatusBar.module.css
├── BingoCard.tsx                       # کارت بازی (کامپوننت مستقل)
│
├── ui/                                 # کامپوننت‌های UI مشترک
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Input.tsx
│   └── ...
│
└── icons/                              # آیکون‌ها (در صورت نیاز)
    └── ...
```

> `BalanceBar.tsx` قدیمی است و باید حذف شود یا با PlayerStatusBar جایگزین شود.  
> `PlayerStatusBar` جزو هدر نیست؛ فقط در صفحات خاص (مثلاً داشبورد پلیر) استفاده می‌شود.

---

## 🔌 ساختار Lib

```
lib/
├── supabaseClient.ts                   # کلاینت Supabase
│
├── hooks/                              # React Hooks برای داده‌ها
│   ├── useBalances.ts                  # موجودی Ding + تومان
│   ├── usePlayerProfile.ts             # اطلاعات بازیکن (نام، آواتار، role و ...)
│   ├── useGameRooms.ts                 # اتاق‌های بازی
│   ├── useAuth.ts                      # وضعیت احراز هویت
│   └── ...
│
├── contexts/                           # React Contexts
│   └── HeaderVisibilityContext.tsx     # کنترل نمایش DingHeader (opt-in / opt-out)
│
├── features/                           # منطق هر فیچر (بدون UI)
│   ├── auth/
│   │   └── auth.ts                     # توابع کمکی برای login/signup/logout
│   ├── player/
│   │   └── player.ts                   # پروفایل، نقش، تنظیمات پلیر
│   ├── game/
│   │   ├── game.ts                     # منطق بازی
│   │   └── rooms.ts                    # مدیریت روم‌ها
│   ├── wallet/
│   │   └── wallet.ts                   # عملیات کیف پول
│   ├── ding/
│   │   └── ding.ts                     # (جایگزین ding.ts فعلی)
│   └── leaderboard/
│       └── leaderboard.ts              # (جایگزین leaderboard.ts فعلی)
│
└── utils/                              # توابع کمکی عمومی
    └── ...
```

---

## 📐 Layout Strategy

### Root Layout (`app/layout.tsx`)
- Metadata
- Theme providers
- Global styles
- قرار دادن contextهای سراسری (مثل HeaderVisibilityContext در صورت نیاز)

### Auth Layout (`app/(auth)/layout.tsx`)
- بدون DingHeader
- بدون PlayerStatusBar
- فقط محتوای صفحات احراز هویت
- ایده‌آل برای نمایش fullscreen فرم ورود/ثبت‌نام

### Player Layout (`app/(player)/layout.tsx`)
- استفاده از DingHeader (به‌صورت پیش‌فرض نمایش داده می‌شود)
- امکان قرار دادن PlayerStatusBar در صفحاتی که لازم است (opt-in در خود صفحه)
- استفاده از HeaderVisibilityContext برای مخفی‌کردن DingHeader در صفحات خاص در صورت نیاز

### Game Layout (`app/(game)/layout.tsx`)
- DingHeader نمایش داده می‌شود (برای ثبات هویت اپ)
- PlayerStatusBar به‌صورت پیش‌فرض نمایش داده نمی‌شود (تمرکز روی بازی)
- در صورت نیاز، می‌توان در برخی صفحات (مثلاً لابی) PlayerStatusBar را هم اضافه کرد

### Wallet / Ding / Messages / Settings Layoutها
- می‌توانند:
  - یا layout اختصاصی داشته باشند،
  - یا از layout پلیر reuse شوند.
- ترجیح: تا زمانی که UI تفاوت اساسی ندارد، از layout پلیر استفاده شود و فقط در فازهای بعدی layout جدا ساخته شود.

### Admin Layout (`app/(admin)/layout.tsx`)
- بدون PlayerStatusBar
- می‌تواند DingHeader را نمایش دهد یا یک هدر مدیریتی خاص داشته باشد
- شامل ناوبری مدیریتی (sidebar/topbar) و فریم ثابت برای داشبوردها

### Agent Layout (`app/(agent)/layout.tsx`)
- سبک‌تر از admin (در صورت نیاز)
- تمرکز روی داشبورد ایجنت، لینک زیرمجموعه‌ها، گزارش‌های ساده

---

## 🧭 Role-Based Routing (مسیر‌دهی بر اساس نقش)

### هدف
بعد از لاگین، کاربر بسته به نقش خود، به بخش مناسب هدایت شود:
- `admin` / `super` → پنل ادمین (`/admin/dashboard`)
- `agent` → پنل ایجنت (`/agent/dashboard`)
- `player` → لابی/خانهٔ پلیر (`/player/home`)
- کاربران بدون نقش مشخص → می‌توانند به flow راهنما یا صفحه انتخاب نقش هدایت شوند (در فازهای بعدی)

### منبع نقش (role)
نقش نباید فقط روی فرانت تعریف شود.  
نقش باید از یکی از این منابع خوانده شود:
- `auth.user_metadata.role`
- یا جدول `profiles` / `user_roles` (بدون تغییر اسکیمای فعلی در این فاز – فقط خواندن)

### پیشنهاد پیاده‌سازی
تعریف یک نقطهٔ میانی بعد از لاگین (مثلاً `/post-login`) که:
- session را از Supabase می‌خواند
- نقش کاربر را از منبع معتبر (metadata یا جدول) می‌گیرد
- بر اساس نقش، redirect به مسیر مناسب انجام می‌دهد:
  - `admin/super` → `/admin/dashboard`
  - `agent` → `/agent/dashboard`
  - `player` → `/player/home`

از این logic می‌توان در:
- سرور کامپوننت‌ها،
- route handler،
- middleware استفاده کرد.

> **مهم**: این ریدایرکت فقط برای UX است.  
> امنیت صفحات admin/agent باید در سطح سرور و RLS نیز با بررسی نقش enforce شود، نه فقط با redirect.

---

## 🔄 Migration Plan

### مرحله 1: ایجاد ساختار پوشه‌ها
1. ایجاد route groupهای جدید مطابق ساختار پیشنهادی.
2. ایجاد layoutهای جدید برای `(auth)`, `(player)`, `(game)`, `(admin)`, `(agent)` و سایر بخش‌ها (در صورت نیاز).
3. ایجاد صفحات placeholder (حتی با محتوای ساده) برای اینکه ساختار کامل شود.

### مرحله 2: انتقال صفحات موجود
- `app/(public)/auth/page.tsx` → `app/(auth)/login/page.tsx` (یا جدا کردن login/signup)
- `app/(protected)/lobby/page.tsx` → `app/(player)/home/page.tsx`
- `app/(protected)/game/[roomId]/page.tsx` → `app/(game)/room/[roomId]/page.tsx`
- `app/test-connection/page.tsx` → `app/(settings)/test-connection/page.tsx`
- `app/page.tsx` → تبدیل به redirect هوشمند بر اساس session (مثلاً به `/auth/login` یا `/player/home`)

### مرحله 3: سازماندهی کامپوننت‌ها
- نگه داشتن `DingHeader`, `DingBalanceCapsule`, `PlayerStatusBar`, `BingoCard` در `components/`
- حذف `BalanceBar.tsx` (قدیمی)
- انتقال کامپوننت‌های UI عمومی به `components/ui/` در صورت نیاز

### مرحله 4: سازماندهی lib
- `useWalletBalances.ts` → بازنویسی/انتقال به `hooks/useBalances.ts`
- `ding.ts` → انتقال به `features/ding/ding.ts`
- `leaderboard.ts` → انتقال به `features/leaderboard/leaderboard.ts`
- نگه داشتن `HeaderVisibilityContext` در `contexts/` و استفاده در layoutها

### مرحله 5: پیاده‌سازی Role-Based Routing
- تعریف مسیر `/post-login` یا الگوی مشابه
- پیاده‌سازی logic تشخیص نقش (بدون تغییر DB)
- ریدایرکت بر اساس نقش به `(player)`, `(admin)`, `(agent)`

### مرحله 6: به‌روزرسانی importها و لینک‌ها
- به‌روزرسانی تمام import paths بر اساس ساختار جدید
- به‌روزرسانی لینک‌ها/ناوبری داخل UI (مثلاً از `/lobby` به `/player/home` و…)
- تست دستی صفحات اصلی

---

## 📍 مسیرهای نهایی

```
/auth/login                    # ورود
/auth/signup                   # ثبت‌نام
/auth/recovery                 # بازیابی رمز

/                              # redirect بر اساس session/role
/post-login                    # نقطه‌ی تصمیم‌گیری بعد از لاگین

/player/home                   # منوی اصلی پلیر
/player/profile                # پروفایل پلیر
/player/leaderboard            # لیدربورد پلیرها (در صورت استفاده)

/game/lobby                    # لابی بازی‌ها
/game/room/[roomId]            # اتاق بازی
/game/results/[roomId]         # نتایج بازی
/game/leaderboard              # لیدربورد بازی‌ها (اختیاری)

/wallet                        # کیف پول
/wallet/deposit                # واریز
/wallet/withdraw               # برداشت

/ding                          # صفحه اصلی Ding
/ding/history                  # تاریخچه Ding
/ding/rewards                  # پاداش‌ها
/ding/leaderboard              # لیدربورد Ding

/messages                      # پیام‌ها / Inbox

/settings                      # تنظیمات
/settings/test-connection      # تست اتصال (dev)

/admin/dashboard               # داشبورد ادمین/سوپر
/admin/rooms                   # مدیریت روم‌ها
/admin/users                   # مدیریت کاربران
/admin/reports                 # گزارش‌ها

/agent/dashboard               # داشبورد ایجنت (در صورت نیاز)
```

---

## ✅ چک‌لیست اجرا

- [ ] ایجاد route groupها و layoutها
- [ ] ایجاد صفحات placeholder در ساختار جدید
- [ ] انتقال صفحات موجود به مسیرهای جدید
- [ ] سازماندهی کامپوننت‌ها در `components/` و حذف موارد قدیمی
- [ ] سازماندهی `lib/hooks/features` مطابق ساختار پیشنهادی
- [ ] پیاده‌سازی Role-Based Routing (مسیر `/post-login` یا مشابه آن)
- [ ] به‌روزرسانی import paths
- [ ] به‌روزرسانی لینک‌های ناوبری
- [ ] تست دستی مسیرهای مهم (`auth`, `player`, `game`, `admin`, `agent`)
- [ ] مستندسازی مختصر در README یا ARCHITECTURE_PLAN.md در مورد نحوه‌ی افزودن فیچر جدید

---

## ⚠️ نکات مهم

1. **هیچ تغییری در دیتابیس** ایجاد نخواهد شد
2. همه تغییرات در سطح frontend است
3. import paths باید به‌روزرسانی شوند
4. `MainMenuScreen` باید به `(player)/home/page.tsx` تبدیل شود
5. `HeaderVisibilityContext` در همه layout‌ها استفاده می‌شود
6. **Role-Based Routing فقط لایه‌ی UX است**؛ امنیت مسیرهای admin/agent باید در سطح سرور و RLS هم چک شود
7. هر تغییری در ساختار پوشه‌ها باید با به‌روزرسانی importها و لینک‌ها همراه باشد تا build نشکند
