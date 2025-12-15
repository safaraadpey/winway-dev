# Bingo UI Specification (Draft)

این سند یک اسکلت اولیه برای UI/UX سیستم بینگو و تورنومنت است. هدف اینه که یک ساختار استاندارد و تکمیل‌پذیر داشته باشیم که هر وقت خواستی، فقط بخش‌های جدید را در همین سند اضافه کنیم.

این پیش‌نویس هیچ‌گونه وابستگی به تکنولوژی (React, Flutter, Next.js) ندارد و صرفاً یک نقشهٔ محصول و تجربه کاربری است.

---

## 1. ساختار کلی صفحات (Top-Level Navigation)

### 1.1. **Home / Lobby**
- نمایش لیست روم‌ها (Normal و Tournament)
- نمایش وضعیت هر روم:
  - قیمت کارت
  - حداقل بازیکن
  - وضعیت فعلی: *waiting / playing / finished*
  - زمان شروع (برای tournament)
- قابلیت فیلتر:
  - Normal
  - Tournament
  - قیمت کارت

### 1.2. **Room Details Page**
- اطلاعات روم:
  - card price
  - min players
  - countdown یا scheduled start time
  - room_seed_hash (اختیاری – برای Fairness)
- تعداد بازیکنان فعلی / ظرفیت
- قابلیت خرید کارت (ticket)
- نمایش کارت‌های کاربر
- وضعیت Live draw بعد از شروع بازی

---

## 2. Ticket UI

### 2.1. **Ticket List**
- نمایش تمامی کارت‌های خریداری‌شده برای روم
- لینک به جزئیات هر کارت (نمایش کارت 3×9)

### 2.2. **Ticket View (3×9)**
- نمایش اعداد کارت
- نمایش مارک‌ها به صورت زنده
- نمایش خطوط برنده (One Line / Two Lines / Full House)
- نمایش Highlight برای آخرین عدد کشیده‌شده

---

## 3. Live Game Screen

### 3.1. **Number Draw Area**
- نمایش آخرین شماره
- نمایش تاریخچه اعداد کشیده‌شده
- نمایش تعداد باقی‌مانده

### 3.2. **Winners Panel**
- نمایش برندگان خطوط مختلف
- نمایش جایزه‌ها
- نمایش لحظه‌ای برنده‌ها

### 3.3. **Seed Fairness Panel**
(فعلاً مخفی؛ بعداً اضافه می‌کنیم)
- نمایش `room_seed_hash`
- لینک «Verify fairness» (بعد از اتمام بازی فعال می‌شود)

---

## 4. Tournament Flow

### 4.1. صفحه Tournament Lobby
- شمارش‌معکوس تا شروع
- نمایش تعداد بازیکنان ثبت‌نام‌شده
- نمایش ظرفیت کارت (Large pool)

### 4.2. Tournament Playing Screen
- مشابه Live Game Screen
- با قابلیت نمایش تعداد بازیکنان بسیار زیاد (>1000)

### 4.3. Tournament Results
- لیست برندگان نهایی، رتبه‌بندی
- نمایش Seed و توضیح Fairness

---

## 5. Account / Wallet

### 5.1. Wallet Overview
- موجودی
- تراکنش‌ها
- واریز/برداشت (بسته به قوانین پروژه)

### 5.2. User Profile
- نام کاربری
- آواتار
- تاریخچه بازی‌ها

---

## 6. Admin Interface (Basic)

### 6.1. Room Control
- نمایش روم‌های در حال انتظار
- امکان:
  - cancel
  - reschedule
  - freeze

### 6.2. Tournament Setup
- ایجاد Tournament جدید
- تنظیمات:
  - زمان شروع
  - قیمت کارت
  - حداقل بازیکنان
  - قالب جایزه

---

## 7. Fairness Verification Page (آتی)

### 7.1. Pre-game
- نمایش `room_seed_hash`

### 7.2. Post-game
- نمایش `room_seed`
- نمایش الگوریتم انتخاب کارت و قرعه
- ابزار ساده برای بازسازی کارت‌ها و Drawها

---

## 8. Component Library (Placeholder)
(بعداً هر کامپوننت React/Next.js را اینجا اضافه می‌کنیم.)

### 8.1. Components
- `RoomCard` (کارت خلاصه روم)
- `TicketCard` (کارت 3×9)
- `LiveNumberBall` (توپ شماره)
- `CountdownTimer`
- `PlayersCounter`
- `SeedHashBadge`
- `WalletBalanceBar`

---

## 9. Style Guidelines (Placeholder)

### 9.1. Color System
- Primary
- Secondary
- Accent
- Success / Error / Warning

### 9.2. Typography
- Heading
- Subheading
- Body text
- UI Labels

### 9.3. Layout Rules
- فاصله‌ها
- استایل کارت‌ها
- سایز توپ‌های قرعه

---

## 10. مسیرهای آینده
- اضافه کردن Seed Audit Tool
- اضافه کردن UI تست محلی
- اضافه کردن دسترسی نمایشی برای ادمین
- اضافه کردن انیمیشن‌های Draw و Ticket Marking

---

## نتیجه
این سند یک قالب پایه برای توسعهٔ UI/UX بینگو است.  
هر وقت وارد طراحی شدیم—چه در Figma و چه مستقیم در Cursor—این سند به عنوان «مرجع بالا-دست» UI استفاده خواهد شد.  
هر بخش که بخواهی، می‌توانیم با هم کامل‌ترش کنیم.

