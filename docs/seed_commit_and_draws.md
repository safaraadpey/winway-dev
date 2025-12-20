# Seed / Commit در سیستم قرعه‌کشی (Winway Bingo)

این سند **وضعیت فعلی دیتابیس** و **مسیرهای واقعی اجرا** را توضیح می‌دهد:  
Seed چطور تولید و ذخیره می‌شود، commit hash چیست، عدد قرعه چطور انتخاب می‌شود، و چه تابع‌هایی در این فرآیند نقش دارند.

> نکته مهم: در این طراحی، **Seed محرمانه است** و برای UI/بازیکن نمایش داده نمی‌شود. چیزی که نمایش داده می‌شود **commit hash** است (هش Seed).

---

## 1) مدل داده (Data Model)

### جدول `public.rooms`
در اسکیما، room دارای دو ستون کلیدی برای fairness است:

- `room_seed bytea`: سید واقعی (باینری) — **محرمانه**
- `room_seed_hash char(64)`: commit hash — هش `sha256(seed)` به صورت hex — **قابل نمایش/استعلام**

همچنین یک ستون برای reveal شدن وجود دارد:

- `seed_revealed_at timestamptz`: زمان reveal شدن seed (در UI فعلی الزاماً استفاده نمی‌شود ولی برای audit مفید است)

> ستون قدیمی `seed text` نیز در جدول هست، اما مسیر فعلی قرعه‌کشی از `room_seed`/`room_seed_hash` استفاده می‌کند.

---

## 2) تولید Seed و Commit Hash

### تابع: `game_core.fn_generate_room_seed()`
این تابع یک seed امن تولید می‌کند و commit hash را می‌سازد:

- seed: `gen_random_bytes(32)` (۳۲ بایت رندوم امن)
- commit hash: `sha256(seed)` → hex با طول ۶۴ کاراکتر

خروجی:

- `seed bytea`
- `seed_hash char(64)`

---

## 3) چه زمانی seed روی room ست می‌شود؟

### مسیر اصلی ایجاد/پیوستن به روم: `game_core.fn_join_or_create_room_base(...)`
در این تابع:

1) اگر روم `waiting` مناسب وجود نداشته باشد، یک روم جدید ساخته می‌شود.  
2) قبل از insert، از `fn_generate_room_seed()` یک seed و hash گرفته می‌شود.  
3) سپس room با `room_seed` و `room_seed_hash` insert می‌شود.

به زبان ساده: **seed و commit hash در همان لحظه ساخت روم (در حالت waiting) تولید و ذخیره می‌شوند**.

---

## 4) انتخاب عدد قرعه (Draw Number) — تصادفی نیست، deterministic است

### تابع موتور قرعه: `game_core.fn_manage_room_live_actions()`
این تابع برای roomهای در وضعیت `playing` اجرا می‌شود و وقتی `next_draw_at <= now()` باشد، یک عدد جدید ثبت می‌کند.

#### 4.1) Backpressure / جلوگیری از draw جدید تا پردازش draw قبلی
اگر برای room هنوز یک draw با `processed_at IS NULL` وجود داشته باشد، draw جدید تولید نمی‌شود.

#### 4.2) الگوریتم انتخاب عدد (۱..۹۰)
عدد بعدی از بین اعداد ۱ تا ۹۰ که قبلاً در `public.draws` برای آن room نیامده‌اند انتخاب می‌شود، اما **انتخاب با random() نیست**.

الگوریتم:

1) همه اعداد باقی‌مانده را لیست می‌کند.
2) آن‌ها را با معیار زیر sort می‌کند:

```
digest( encode(room_seed,'hex') || ':' || number::text, 'sha256' )
```

3) اولین عدد (کمترین digest) انتخاب می‌شود.

نتیجه مهم:

- توالی drawها **کاملاً تابع seed** است.
- با دانستن `room_seed` می‌توان بعداً توالی drawها را **بازسازی و verify** کرد.
- بدون دانستن seed، تنها چیزی که داریم commit hash است (اثبات اینکه seed از قبل commit شده).

---

## 5) ثبت draw و پردازش آن

### جدول `public.draws`
هر draw شامل `id uuid`, `room_id`, `number`, `created_at`, و همچنین `processed_at` است.

در `fn_manage_room_live_actions()` وقتی `v_next` تعیین شد:

- یک row در `public.draws` insert می‌شود.
- یک trigger بعد از insert (در DB) `draw_jobs` را enqueue می‌کند.
- سپس workerها (RPCها) marks/evaluate/payout را انجام می‌دهند و در پایان `processed_at` ست می‌شود.

---

## 6) API / نمایش commit در UI

### چرا commit را نمایش می‌دهیم؟
commit (`room_seed_hash`) برای بازیکن/پشتیبانی یک «اثر انگشت» از seed است که نشان می‌دهد:

- seed از قبل وجود داشته (commit شده)
- موتور قرعه‌کشی روی seed ثابت کار کرده

### Endpoints مرتبط
- `GET /api/player/live-room?roomId=...`
  - شامل `room.room_seed_hash` (commit) برای نمایش حین بازی
- `GET /api/player/room-results?roomId=...`
  - شامل `commitHash` برای نمایش در صفحه نتایج

> نکته امنیتی: ما فقط commit hash را نمایش می‌دهیم، نه seed.

---

## 7) RPCهای کاربردی برای audit / اثبات

### `game_core.rpc_get_room_seed_hash(room_id)`
فقط commit hash را برای یک room برمی‌گرداند.

### `game_core.rpc_reveal_room_seed(room_id)`
برای audit، seed را فقط وقتی room **finished** باشد برمی‌گرداند (در خود RPC چک status وجود دارد).  
این خروجی می‌تواند برای **بازسازی توالی drawها** و verify fairness استفاده شود.

---

## 8) چک‌لیست صحت (Verification Checklist)

برای verify یک بازی:

1) commit hash (`room_seed_hash`) را بردارید.
2) اگر/وقتی seed reveal شد:
   - `sha256(seed)` را محاسبه کنید و با commit hash مقایسه کنید.
3) با همان seed:
   - برای هر عدد ۱..۹۰ مقدار `sha256(hex(seed) + ":" + n)` را حساب کنید.
   - sort کنید و توالی drawها را بسازید.
4) با `public.draws` برای room مقایسه کنید.

---

## 9) نکات و محدودیت‌ها

- این سیستم **pseudo-random** است (deterministic بر اساس seed) و برای fairness مناسب است چون:
  - seed commit می‌شود (hash قابل مشاهده)
  - بعداً seed می‌تواند reveal شود (برای audit)
- اگر seed هرگز reveal نشود، بازیکن فقط می‌تواند commit را ببیند (اثبات کامل fairness نیازمند reveal است).


