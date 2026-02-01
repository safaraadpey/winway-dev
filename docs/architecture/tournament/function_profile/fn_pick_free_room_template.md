## Function Execution Profile

### Name
**tournament.fn_pick_free_room_template**

---

### Purpose (یک جمله)
انتخاب یک `room_template` آزاد و فعال برای `room_type` مشخص، با تضمین اینکه هیچ Room در وضعیت‌های فعال از آن Template وجود نداشته باشد.

---

### Role in Architecture
- **Policy / Allocator (Template Selection Policy)**
- یک تابع سیاست‌گذار برای انتخاب Template؛ منطق «کدام template آزاد است» را از چرخه‌ی تورنومنت جدا نگه می‌دارد.

---

### When it runs
- توسط `tournament.fn_assign_templates_for_round` برای تخصیص `room_template_id` به میزهای راند.
- ممکن است چند بار در یک tick یا چند tick تکرار شود (به تعداد میزهایی که نیاز به template دارند).

---

### Inputs (ورودی‌ها)
- `p_room_type text` : نوع روم/بازی که Template باید مطابق آن انتخاب شود.

---

### Selection Logic (منطق انتخاب)
از جدول `public.room_templates` یک Template را انتخاب می‌کند که:
- `status = active`
- `room_type = p_room_type`
- و **هیچ Room فعالی** از آن وجود نداشته باشد، یعنی هیچ رکوردی در `public.rooms` با:
  - `room_template_id = rt.id`
  - و `status IN (waiting, live, playing, settling)`

انتخاب نهایی:
- `ORDER BY random()` و `LIMIT 1`

---

### Output (خروجی)
- `uuid` : شناسه `room_templates.id` انتخاب‌شده.

---

### Failure Modes (حالت‌های شکست)
- اگر هیچ Template آزادی پیدا نشود:
  - `RAISE EXCEPTION 'No free room_template found (room_type=%)'`

---

### Side Effects
- هیچ تغییر دیتایی انجام نمی‌دهد (read‑only).

---

### Concurrency Notes
- این تابع به‌تنهایی قفل سخت ایجاد نمی‌کند؛ «آزاد بودن» را با `NOT EXISTS` روی وضعیت Roomها می‌سنجد.
- جلوگیری از race در سطح بالاتر (مثلاً `fn_assign_templates_for_round` با `FOR UPDATE SKIP LOCKED`) انجام می‌شود.

---

### Debug Notes (برای دیباگ سریع)
- اگر دائماً خطای "No free room_template" می‌گیری:
  - بررسی کن آیا Templateهای `active` برای `room_type` وجود دارند.
  - بررسی کن آیا Roomهای فعال (waiting/live/playing/settling) روی همان templateها گیر کرده‌اند.
- اگر توزیع انتخاب بین templateها مهم است:
  - `ORDER BY random()` توزیع تقریبی می‌دهد ولی deterministic نیست و می‌تواند بار DB را بالا ببرد (نقطه‌ی بهینه‌سازی در آینده).

