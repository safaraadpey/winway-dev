## ثبت‌نام پلیر، Template، و Join/Create Room (تبیین دقیق برای Tournament Engine)

### هدف این بخش
این بخش توضیح می‌دهد تورنومنت چگونه:
1) پلیرها را «ثبت‌نام / ورود به تورنومنت» می‌کند (Registration / Entry)،  
2) از `room_template_id` برای نشاندن پلیرها روی میزها استفاده می‌کند،  
3) و چگونه **بدون ساختن Room**، پلیرها را از مسیر استاندارد سیستم به روم “Join” می‌کند (با استفاده از RPC جوین/کریت روم که رفتار کاربر را تقلید می‌کند).

> اصل طلایی: **Tournament Engine نباید هیچ‌وقت Room بسازد یا Room را مستقیم دستکاری کند.**  
> تورنومنت فقط “Template” و “Seat Assignment” دارد؛ ساخت/جوین روم فقط مسئولیت Game Room Engine است.

---

## 1) تعریف‌ها و واژگان

### Tournament Entry (ثبت‌نام در تورنومنت)
یک مفهوم منطقی که نشان می‌دهد یک `player`:
- در یک `tournament_id` شرکت کرده
- هزینه / ودیعه را پرداخت کرده یا رزرو شده
- و حق دریافت صندلی در راندهای تورنومنت را دارد

**Registration = حق شرکت + تعهد مالی + قوانین اعتبارسنجی**

---

### Room Template (الگوی روم)
`room_template_id` یک تعریف از میز بازی است، نه خود میز.
Template مشخص می‌کند:
- نوع بازی
- قوانین، ظرفیت‌ها، کارت‌ها / دیسک‌ها، تایمرها
- سیاست‌های امنیتی و محدودیت‌ها

---

### Room (نمونه واقعی میز)
یک instance واقعی ساخته‌شده توسط Game Room Engine با وضعیت‌های:
`waiting / playing / live / settling / finished / cancelled`

---

## 2) مرزبندی مسئولیت‌ها (Separation of Concerns)

### مسئولیت Tournament Engine
- مدیریت چرخه تورنومنت: ثبت‌نام، شروع، راندها، حذف، امتیازدهی، جوایز
- تولید Seat Assignment برای هر راند
- اعلام نیاز به Join بر اساس Template (نه Room)

### مسئولیت Game Room Engine
- تضمین حداکثر یک Room در وضعیت `waiting` برای هر Template
- ساخت Room در صورت نبود waiting
- مدیریت lifecycle کامل بازی

> Tournament فقط می‌گوید «کدام پلیر روی کدام Template»،  
> Game Room Engine تصمیم می‌گیرد «در کدام Room واقعی».

---

## 3) اصل حیاتی: تقلید رفتار کاربر برای Join

تابع `fn_join_or_create_room(...)` از دید معماری یک **مسیر کاربر** است.
این مسیر ممکن است بر اساس هویت پلیر تصمیم بگیرد:
- بررسی وضعیت player / agent / super
- بررسی وضعیت template
- تخصیص ticket / card

### تقلید رفتار کاربر یعنی چه؟
یعنی تورنومنت Join را طوری انجام دهد که انگار خود پلیر دکمه Join را زده است:
- با هویت مشخص پلیر
- با اعمال تمام قوانین امنیتی
- با دریافت خروجی استاندارد Join

> Join بدون تقلید رفتار کاربر = یا امنیت شکسته می‌شود، یا Join ناپایدار است.

---

## 4) استفاده از Template در Seating

### اصل پایه
- در ابتدای هر راند، هیچ `room_id`ای وجود ندارد
- تورنومنت فقط با `room_template_id` کار می‌کند
- Seat Assignment یعنی نگاشت `entry/user → template`

### چرا Template و نه Room؟
Room یک شیء runtime و ناپایدار است؛ Template کلید همگرایی سیستم‌هاست.

---

## 5) جریان استاندارد (Standard Flow)

### مرحله A: Registration
1) پلیر ثبت‌نام می‌کند → Entry ایجاد می‌شود
2) هزینه مدیریت می‌شود
3) Entry فعال می‌شود

---

### مرحله B: Round Seating
1) شروع راند N
2) تولید Seat Assignment شامل:
   - user_id / entry_id
   - room_template_id
   - card_count

---

### مرحله C: Join/Create Room
1) Join از مسیر تقلید کاربر trigger می‌شود
2) Game Room Engine join/create را انجام می‌دهد
3) خروجی:
   - room_id
   - ticket_ids
   - starts_at

---

### مرحله D: Play Lifecycle
مدیریت بازی، شروع و پایان کاملاً بر عهده Game Room Engine است.

---

## 6) قراردادهای رفتاری (Behavioral Contracts)

- Tournament هرگز Room نمی‌سازد
- حداکثر یک waiting room برای هر Template
- Ticket فقط از مسیر Join ساخته می‌شود
- Template باید فعال باشد

---

## 7) جلوگیری از سوءبرداشت‌های رایج

- Entry ≠ Ticket
- Seat Assignment ≠ Room Assignment
- Join/Create Room مسئولیت Game Room Engine است
- Tournament باید Join را مثل کاربر انجام دهد

---

## 8) چک‌لیست اجرایی

- مسیر استاندارد Join با هویت پلیر
- Seat Assignment مبتنی بر Template
- بدون دستکاری مستقیم rooms / tickets
- مدیریت خطاهای وضعیت کاربر و Template
- لاگ Join شامل user_id, entry_id, template_id, room_id
