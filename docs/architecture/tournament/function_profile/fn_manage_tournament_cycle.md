## Function Execution Profile

### Name
**tournament.fn_manage_tournament_cycle**

---

### Purpose (یک جمله)
برنامه‌ریزی راند بعدی تورنومنت: تعیین شرکت‌کنندگان راند بعد، محاسبه تعداد/اندازه میزها، ساخت «میزهای فرضی» (tournament_round_rooms با room_id=NULL)، و ثبت قطعی نگاشت «پلیر → میز» در `tournament_round_assignments` با `trr_id`.

---

### Role in Architecture
- **Decision maker / Planner**: تصمیم می‌گیرد راند بعد چگونه شکل بگیرد (چند میز، چه کسانی کجا).
- **Template‑first / Room‑later**: هیچ Room واقعی نمی‌سازد؛ فقط ساختار راند و میزهای فرضی را می‌سازد.

---

### When it runs
- از داخل `tournament.fn_tick_tournament` زمانی که:
  - هیچ راندی وجود ندارد (ساخت راند ۱)
  - یا راند جاری تمام شده و باید راند بعدی برنامه‌ریزی شود

---

### Inputs (ورودی‌ها)
- `p_tournament_id uuid` : تورنومنت هدف.
- `p_seed bigint` : seed برای چینش شبه‌تصادفی و متادیتای راند.

---

### Preconditions (پیش‌شرط‌ها)
- تورنومنت باید **`running`** باشد؛ در غیر اینصورت تابع بدون برنامه‌ریزی برمی‌گردد.
- اگر `v_curr_round > 0` باشد، وضعیت تمام رکوردهای `tournament_round_rooms` مربوط به راند جاری باید `finished` شده باشد؛ وگرنه تابع skip می‌کند.
- نباید برای `v_next_round` از قبل `tournament_round_rooms` وجود داشته باشد.

---

### Participant Source (شرکت‌کننده‌ها از کجا می‌آیند)
- **راند ۱ (v_curr_round = 0):**
  - از `public.tournament_entries` با `status='created'`
  - `cards_count = GREATEST(COALESCE(tickets_count,1),1)`

- **راندهای بعدی (v_curr_round > 0):**
  - از برنده‌های راند قبلی: `public.room_winners` برای `room_id`های راند جاری
  - سپس join با `public.tournament_entries` برای گرفتن `tickets_count`
  - `cards_count` همان قاعده بالا

---

### Table Partitioning Logic (تقسیم به میزها)
- تنظیمات از رکورد تورنومنت:
  - `table_size_mode` (fixed / range)
  - در fixed: `table_size_fixed`
  - در range: `table_size_min`, `table_size_max`
- خروجی محاسبه:
  - آرایه `v_sizes[]` که اندازه هر میز را تعیین می‌کند (میز ۱ چند نفر، میز ۲ چند نفر، ...)

---

### Ordering / Fairness (ترتیب‌دهی و عدالت)
- شرکت‌کننده‌ها در `_tp_ordered` با `ROW_NUMBER()` مرتب و شماره‌گذاری می‌شوند.
- اگر `p_seed` NULL باشد: ترتیب غیرقطعی (random)
- اگر `p_seed` مقدار داشته باشد: ترتیب شبه‌تصادفیِ **تکرارپذیر** بر پایه ترکیب `p_seed + tournament_id + user_id` (کلید هش)

---

### Writes / Outputs (چه چیزی می‌سازد)
#### 1) ساخت میزهای فرضی راند بعد
- جدول: `public.tournament_round_rooms`
- خصوصیات کلیدی:
  - `round_no = v_next_round`
  - `table_no = v_i`
  - `room_id = NULL`
  - `status = 'created'`
  - `target_players = v_sizes[v_i]`
  - `meta` شامل `generated_at`, `seed`, `table_min`, `table_max`

#### 2) ثبت قطعی نگاشت پلیر → میز (Truth)
- جدول: `public.tournament_round_assignments`
- فیلد حقیقت: **`trr_id`**
- خروجی منطقی:
  - هر `user_id` دقیقاً به یک `trr_id` (میز فرضی) برای `round_no=v_next_round` وصل می‌شود.

> نکته مهم: `room_id`/`game_room_id` در این مرحله باید NULL بمانند و در مرحله Join واقعی (seat/join) پر شوند.

---

### Calls (توابعی که صدا می‌زند)
- این تابع در نسخه‌ی برنامه‌ریز، به تابع دیگری وابسته نیست (فقط SQL داخلی و insert/update انجام می‌دهد).

---

### Side Effects
- `public.tournaments.updated_at` به‌روز می‌شود.
- راند بعدی و assignmentها ایجاد می‌شوند.

---

### Failure Modes (حالت‌های شکست)
- `tournament not found` اگر رکورد وجود نداشته باشد.
- خطا در تنظیمات اندازه میز (fixed نامعتبر یا range نامعتبر).
- «عدم امکان پارتیشن‌بندی» در صورت ناسازگاری count با min/max (در نسخه‌هایی که این constraint enforce می‌شود).

---

### Debug Notes (برای دیباگ سریع)
- اگر راند بعد ساخته نمی‌شود:
  - وضعیت تورنومنت را چک کن (باید `running` باشد).
  - بررسی کن راند جاری کاملاً `finished` شده باشد.
- اگر seat کردن میزها مشکل دارد:
  - سریع‌ترین مسیر دیباگ: `tournament_round_assignments.trr_id → tournament_round_rooms(id) → table_no/round_no`
- اگر چینش پلیرها “غیرقابل تکرار” است:
  - مطمئن شو `p_seed` NULL نباشد.

