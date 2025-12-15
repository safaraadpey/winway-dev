# Tournament Mode Architecture (Provably Fair, On-the-Fly Card Generation)

## Overview
این سند معماری کامل حالت **تورنومنت** را توضیح می‌دهد؛ حالتی که در آن تعداد پلیر و تعداد کارت‌ها بسیار بیشتر از ظرفیت ۱۵۰ کارت ثابت است. در این مدل، کارت‌ها به‌صورت **در لحظه (on-the-fly)** و با استفاده از مدل رمزنگارانه‌ی **room_seed** ساخته می‌شوند تا بدون نیاز به مخزن کارت، امکان بازی‌های بزرگ فراهم شود.

این روش:
- محدودیت ۱۵۰ کارت سنتی را حل می‌کند.
- همچنان provably fair باقی می‌ماند.
- کارت‌ها همیشه یکتا و قابل‌ممیزی تولید می‌شوند.
- و هیچ جایی برای انتخاب‌گری سرور یا همدستی وجود ندارد.

---

## Why Tournament Needs On-the-Fly Cards
در تورنومنت‌ها:
- تعداد زیاد بازیکن‌ها (مثلاً ۳۰۰ نفر)
- و تعداد زیاد کارت‌های هر بازیکن (مثلاً ۵ کارت)

به این معنی است که بیش از **۱۵۰۰ کارت** نیاز خواهد بود.

در نتیجه، مدل «۱۵۰ کارت ثابت» برای حالت تورنومنت کافی نیست و کارت‌ها باید در لحظه ساخته شوند.

---

## Core Idea
هر room یک `room_seed` (bytea) مخصوص به خودش دارد که در جدول `rooms` ذخیره می‌شود.
این seed همان ستون فقرات تصادفی‌سازی است.

با استفاده از **domain separation** می‌توان از همین seed چندین جریان مجزا تولید کرد:
- جریان «DRAW» برای قرعه اعداد (مشابه Normal Mode)
- جریان «TOURNAMENT_CARD» برای ساخت کارت به ازای هر بازیکن

**تفاوت با Normal Mode:**
- Normal Mode: کارت‌ها از `card_pool_cards` انتخاب می‌شوند (200 کارت اول)
- Tournament Mode: می‌تواند از کل Pool استفاده کند یا کارت‌ها را on-the-fly تولید کند

در نتیجه، همه‌چیز deterministic، قابل بازتولید و غیرقابل دستکاری است.

---

## On-the-Fly Card Generation
### فرمول ساخت کارت تورنومنت (۹×۳)
هر کارت از ترکیب deterministic زیر ساخته می‌شود:
```
card = generateCard(
  room_seed,
  "TOURNAMENT_CARD",
  player_id,
  card_slot_index  -- کارت اول، دوم، سوم، ... بازیکن
)
```

### ویژگی‌ها:
- **کارت‌ها یکتا هستند** چون player_id و card_slot_index متفاوت است.
- **سرور کنترلی روی انتخاب کارت ندارد** چون تابع کاملاً ریاضی است.
- **بازیکن نمی‌تواند نتیجه را حدس بزند** چون تا پایان بازی seed را ندارد.
- **ابعاد کارت‌ها ۹×۳** است و تابع generateCard مطابق با قوانین استاندارد دبرنا ساخته می‌شود.

---

## Draw Sequence (مشابه حالت کلاسیک)
قرعه‌کشی با همان روش گذشته انجام می‌شود:
```
draw_k = H(room_seed || "DRAW" || k)
```
این جریان کاملاً جدا از جریان ساخت کارت است.

---

## Commitment & Reveal
پیش از شروع بازی:
1. سرور `room_seed` (bytea) را با `game_core.fn_generate_room_seed()` تولید می‌کند
2. hash آن را به‌صورت عمومی در `room_seed_hash` (char(64)) ذخیره می‌کند:
   ```
   room_seed_hash = SHA256(room_seed) → char(64)
   ```
3. Hash از طریق `game_core.rpc_get_room_seed_hash(p_room_id)` قابل دسترسی است
4. `room_seed` (bytea) مخفی می‌ماند تا بازی تمام شود

بعد از پایان بازی:
1. Room به status `finished` می‌رود
2. `room_seed` از طریق `game_core.rpc_reveal_room_seed(p_room_id)` افشا می‌شود
3. `seed_revealed_at` (timestamptz) ثبت می‌شود
4. هر کس بخواهد می‌تواند:
   - Hash را دوباره محاسبه کند و با `room_seed_hash` مقایسه کند
   - کارت خودش را بازتولید کند
   - کارت‌های دیگر را بازتولید کند
   - sequence complete قرعه‌ها را بازسازی کند

این همان **Provably Fair** واقعی است.

**ساختار دیتابیس:**
- `rooms.room_seed` (bytea): Seed مخفی
- `rooms.room_seed_hash` (char(64)): Hash عمومی
- `rooms.seed_revealed_at` (timestamptz): زمان افشای seed

---

## Why This Tournament Architecture Works
- کارت‌ها نامحدودند، بدون نیاز به مخزن.
- همه‌چیز از یک منبع randomness مادر ساخته می‌شود.
- انتخاب کارت سرور را حذف می‌کند.
- امکان همدستی یا دستکاری وجود ندارد.
- audit و بازبینی کامل بعد از بازی امکان‌پذیر است.
- سازگار با مدل سنتی دبرنا و ذهن ساده‌تر بازیکنان.

---

## Summary
- **Normal Mode** → از 200 کارت اول `card_pool_cards` + انتخاب deterministic از روی `room_seed`
- **Tournament Mode** → می‌تواند از کل Pool استفاده کند یا کارت ۹×۳ را در لحظه از روی `room_seed` تولید کند
- **یک seed** → چندین جریان مستقل: DRAW و TOURNAMENT_CARD
- **commitment & reveal** → `room_seed_hash` قبل بازی، `room_seed` بعد بازی
- **RPC Functions**:
  - `game_core.rpc_get_room_seed_hash(p_room_id)`: دریافت Hash
  - `game_core.rpc_reveal_room_seed(p_room_id)`: افشای Seed
- مناسب روم‌های بزرگ، مسابقات چندصدنفره، و بازی‌های ویژه

**ساختار دیتابیس:**
- `rooms.room_seed` (bytea): Seed مخفی
- `rooms.room_seed_hash` (char(64)): Hash عمومی
- `rooms.seed_revealed_at` (timestamptz): زمان افشای seed
- `rooms.pool_id` (uuid): اتصال به `card_pools`

این مدل تورنومنت را به یک ساختار کامل، امن، مقیاس‌پذیر و قابل‌اعتماد تبدیل می‌کند.

