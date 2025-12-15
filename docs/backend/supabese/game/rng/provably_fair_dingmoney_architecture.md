# Provably Fair Bingo Architecture (Hybrid Traditional + Modern Cryptographic Model)

## Overview
این سند معماری کامل سیستم «عادلانه و قابل‌اثبات» برای بازی بینگو (دبرنا) را توضیح می‌دهد. مدل پیشنهادی ترکیبی از سنت کارت‌های ثابت و مدرن‌ترین روش‌های رمزنگاری است. هدف این ساختار ایجاد اعتماد کامل در پلیرها، حذف امکان تقلب، و قابل‌ممیزی بودن تمام فرآیندهای مهم بازی است.

در این مدل:
- **Card Pool System**: کارت‌ها در جدول `card_pools` و `card_pool_cards` ذخیره می‌شوند (حداقل 500 کارت)
- هر Pool دارای `pool_seed` (bytea) و `commit_hash` (text) برای provably fair بودن است
- هنگام شروع هر بازی، یک **room_seed** (bytea) تولید می‌شود
- با استفاده از یک **room_seed_hash** (char(64)) قبل از شروع بازی، سرور خود را به این seed متعهد می‌کند
- همین room_seed به دو جریان مستقل استفاده می‌شود:
  1) **تولید نوبت‌های قرعه (Draw Sequence)**
  2) **انتخاب کارت برای هر بازیکن از Card Pool**
- پس از پایان بازی، seed افشا می‌شود (`seed_revealed_at`) و تمام پلیرها می‌توانند مسیر کامل تولید قرعه‌ها و کارت‌ها را بازتولید و تأیید کنند

این مدل امکان هر نوع همدستی بین سرور و یک بازیکن را از بین می‌برد.

---

## Card Pool System
- کارت‌ها در جدول `card_pools` و `card_pool_cards` ذخیره می‌شوند
- هر Pool دارای:
  - `pool_seed` (bytea): Seed برای تولید کارت‌ها
  - `commit_hash` (text): Hash برای provably fair بودن
  - `card_count` (integer): تعداد کارت‌ها (پیش‌فرض: 500)
  - `prng_version` (text): نسخه الگوریتم PRNG (پیش‌فرض: 'v1')
- کارت‌ها در `card_pool_cards` با ساختار 9×3 (27 سلول) ذخیره می‌شوند
- هر Room به یک Pool متصل است (`rooms.pool_id`)
- برای Normal Mode: از 200 کارت اول Pool استفاده می‌شود
- برای Tournament Mode: از کل Pool استفاده می‌شود

---

## Seed Commitment (قبل از شروع بازی)
هر room هنگام ایجاد شدن:
1. یک مقدار تصادفی: `room_seed` (bytea) با استفاده از `game_core.fn_generate_room_seed()` تولید می‌شود
2. هش آن محاسبه می‌شود:
   ```
   room_seed_hash = SHA256(room_seed) → char(64)
   ```
3. فقط `room_seed_hash` به پلیرها نشان داده می‌شود (از طریق `game_core.rpc_get_room_seed_hash()`)
4. `room_seed` (bytea) مخفی می‌ماند تا بازی تمام شود
5. در جدول `rooms`:
   - `room_seed` (bytea): Seed مخفی
   - `room_seed_hash` (char(64)): Hash عمومی
   - `seed_revealed_at` (timestamptz): زمان افشای seed (NULL تا پایان بازی)

این مرحله تضمین می‌کند که سرور نمی‌تواند در طول بازی seed را تغییر دهد.

---

## Draw Sequence (استخراج اعداد قرعه)
جریان اول بر اساس room_seed:
```
draw_k = H(room_seed || "DRAW" || k)
```
خروجی هش تبدیل می‌شود به اعداد ۱ تا ۹۰ با حذف تکراری‌ها.

این جریان یک دنباله‌ی **deterministic** تولید می‌کند که قبل از بازی قفل بوده و بعد از بازی قابل تأیید است.

---

## Card Assignment (تخصیص کارت به بازیکن)
برای جلوگیری از انتخاب‌گری سرور، تخصیص کارت به بازیکن هم کاملاً deterministic و بر پایه همان room_seed است:

**Normal Mode:**
- کارت‌ها از `card_pool_cards` انتخاب می‌شوند
- فقط از 200 کارت اول Pool استفاده می‌شود
- ترتیب انتخاب بر اساس:
  ```
  ORDER BY SHA256(encode(room_seed, 'hex') || ':' || card_id)
  ```
- کارت‌ها به صورت deterministic و بر اساس Seed مرتب می‌شوند

**Tournament Mode:**
- از کل Pool استفاده می‌شود
- کارت‌ها به صورت on-the-fly تولید می‌شوند (مشاهده `tournament_dingmoney_architecture.md`)

امکانات این مدل:
- سرور نمی‌تواند کارت «خوب» انتخاب کند
- بازیکن نمی‌تواند نتیجه را پیش‌بینی کند
- اگر کسی بخواهد صحت انتخاب کارت را بررسی کند، فقط room_seed لازم است
- کارت‌ها از Pool ثابت و قابل ممیزی انتخاب می‌شوند

**Domain Separation** با استفاده از `room_seed` و `card_id` تضمین می‌کند که ترتیب deterministic است.

---

## Fairness Verification (قابل‌اثبات بودن)
پس از پایان بازی:
1. Room به status `finished` می‌رود
2. سرور `room_seed` را از طریق `game_core.rpc_reveal_room_seed()` منتشر می‌کند
3. `seed_revealed_at` ثبت می‌شود
4. هر بازیکن با گرفتن `room_seed` و `room_seed_hash` می‌تواند:
   - Hash را دوباره محاسبه کند و با `room_seed_hash` مقایسه کند
   - خودش sequence کامل drawها را بازسازی کند
   - کارت اختصاصی‌اش را دوباره محاسبه کند
   - تطبیق دهد که همه‌چیز دقیقاً مطابق قوانین بوده است

این مدل **Provably Fair** است بدون اینکه کاربر مجبور باشد مفاهیم پیچیده بلاک‌چین یا رندم‌سازی را بفهمد.

**RPC Functions:**
- `game_core.rpc_get_room_seed_hash(p_room_id)`: دریافت Hash قبل از بازی
- `game_core.rpc_reveal_room_seed(p_room_id)`: افشای Seed بعد از بازی

---

## Why This Architecture Works
- کارت‌ها عمومی و قابل لمس هستند → حس سنتی و اعتماد اولیه ایجاد می‌کند.
- seed قبل بازی قفل می‌شود و بعد بازی افشا → امکان تقلب صفر می‌شود.
- انتخاب کارت deterministic و غیرقابل کنترل است → هیچ راهی برای همدستی سرور و پلیر نیست.
- drawها کاملاً قابل بازتولیدند → شفافیت کامل.

این مدل بهترین ترکیب از **اعتماد سنتی** + **امنیت مدرن** است.

---

## خلاصه
- **Card Pool System** = کارت‌ها در دیتابیس ذخیره می‌شوند (حداقل 500 کارت)
- **room_seed** (bytea) = ستون فقرات امنیت بازی
- **room_seed_hash** (char(64)) = commitment قبل از بازی
- **seed_revealed_at** = زمان افشای seed بعد از بازی
- **domain-separated randomness** = دو جریان مستقل با یک seed
- **commitment & reveal** = جلوگیری از هر نوع دستکاری
- **deterministic card assignment** = حذف کامل احتمال همدستی
- **Normal Mode**: از 200 کارت اول Pool
- **Tournament Mode**: از کل Pool یا on-the-fly generation

این معماری بازی بینگو را واقعاً عادلانه، ساده برای کاربر، و قابل‌ممیزی برای متخصصان می‌کند.

