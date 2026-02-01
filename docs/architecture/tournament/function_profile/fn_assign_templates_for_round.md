## Function Execution Profile

### Name
**tournament.fn_assign_templates_for_round**

---

### Purpose (یک جمله)
تخصیص `room_template_id` به «میزهای فرضی» راند مشخص (در `tournament_round_rooms`) برای میزهایی که هنوز template ندارند، به‌صورت batch‑aware و concurrency‑safe.

---

### Role in Architecture
- **Runtime allocator** بین «تصمیم تورنومنت» و «اجرای Game Room Engine».
- تورنومنت Room واقعی نمی‌سازد؛ فقط برای هر table یک Template مناسب/آزاد انتخاب و ثبت می‌کند.

---

### When it runs
- از داخل `tournament.fn_tick_tournament` در مرحله 5a، قبل از seat کردن پلیرها.
- ممکن است چند بار تکرار شود تا همه‌ی میزها template بگیرند (به‌خصوص در حالت batch یا concurrency).

---

### Inputs (ورودی‌ها)
- `p_tournament_id uuid` : تورنومنت هدف.
- `p_round_no int` : راند هدف.
- `p_batch_tables int[]` : اگر مقدار داشته باشد فقط روی `table_no`های این لیست عمل می‌کند؛ اگر NULL باشد روی همه میزهای راند.

---

### Selection Logic (کدام رکوردها را تغییر می‌دهد)
از `public.tournament_round_rooms` فقط رکوردهایی که:
- `tournament_id = p_tournament_id`
- `round_no = p_round_no`
- `room_template_id IS NULL`
- و (در صورت وجود batch) `table_no = ANY(p_batch_tables)`

مرتب‌سازی:
- `ORDER BY table_no`

قفل‌گیری:
- `FOR UPDATE SKIP LOCKED`

---

### Core Action (کاری که انجام می‌دهد)
برای هر میز انتخاب‌شده:
1) یک template آزاد/مناسب انتخاب می‌کند.
2) همان template را در `tournament_round_rooms.room_template_id` ثبت می‌کند.
3) در `meta` زمان تخصیص و خود template را ثبت می‌کند.

---

### Calls (توابعی که صدا می‌زند)
#### انتخاب template آزاد
- `tournament.fn_pick_free_room_template(...)`

> نکته معماری: VIP در این مسیر باید حذف شده باشد؛ تصمیم انتخاب template باید مستقل از پارامترهای مبهم باشد.

---

### Writes / Side Effects
- جدول: `public.tournament_round_rooms`
  - مقداردهی `room_template_id`
  - بروزرسانی `meta` با کلیدهای:
    - `template_assigned_at`
    - `room_template_id`

---

### Concurrency Notes
- `SKIP LOCKED` اجازه می‌دهد چند worker/tick همزمان روی میزهای مختلف کار کنند.
- توصیه: در update نهایی نیز شرط `room_template_id IS NULL` حفظ شود تا race در لبه‌ها بی‌خطر باشد.

---

### Failure Modes (حالت‌های شکست)
- اگر انتخاب template به `NULL` برسد (کمبود منابع/template آزاد) بهتر است:
  - یا خطا دهد (fail fast)
  - یا skip کند و در لاگ ثبت شود (وابسته به سیاست سیستم)

---

### Debug Notes (برای دیباگ سریع)
- اگر seat انجام نمی‌شود ولی راند ساخته شده:
  - چک کن `tournament_round_rooms.room_template_id` برای tableها پر شده باشد.
- اگر فقط بعضی میزها template دارند:
  - `p_batch_tables` یا قفل‌های همزمان (SKIP LOCKED) را بررسی کن.
- مسیر ردیابی:
  - `tournament_round_rooms (round_no, table_no) → room_template_id → join/create room`

