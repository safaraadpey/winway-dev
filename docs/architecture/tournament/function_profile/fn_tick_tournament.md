## Function Execution Profile

### Name
**tournament.fn_tick_tournament**

---

### Purpose (یک جمله)
پیشبرد state تورنومنت در هر tick: شروع تورنومنت در زمان مقرر، همگام‌سازی وضعیت میزهای راند با Roomهای واقعی، ساخت/ادامه راند جاری، نشاندن پلیرها روی میزها (template‑محور)، و تشخیص پایان راند برای رفتن به مرحله بعد.

---

### When it runs
- توسط orchestrator (مثل `fn_tick_due_tournaments`) یا هر job زمان‌بندی‌شده.
- فقط روی تورنومنت مشخص (`p_tournament_id`).

---

### Inputs (ورودی‌ها)
- `p_tournament_id uuid` : تورنومنت هدف.
- `p_seed bigint` : seed کنترلی برای مدیریت چرخه/تصمیم‌ها.
- `p_batch_tables integer[]` : اگر مقدار داشته باشد tick را فقط روی table_noهای همین batch اجرا می‌کند؛ اگر NULL باشد روی همه میزهای راند جاری.

---

### Concurrency / Locking
- ابتدا تورنومنت را با `FOR UPDATE NOWAIT` قفل می‌کند تا اجرای همزمان برای یک تورنومنت رخ ندهد.
- اگر قفل در دسترس نباشد، caller باید handle کند (معمولاً با `lock_not_available`).

---

### Core Flow (خلاصه مراحل)
1) **Lock + Load** رکورد تورنومنت.
2) **Gate Start**: اگر `registration_open` باشد و `start_at` رسیده باشد → وضعیت را `running` می‌کند؛ اگر هنوز زمان نرسیده باشد → `RETURN`.
3) اگر وضعیت تورنومنت `running` نیست → `RETURN`.
4) **Best‑effort Sync**: وضعیت `tournament_round_rooms` را با `rooms.status` همگام می‌کند.
5) **Ensure Current Round**: اگر هنوز راندی ساخته نشده، با `fn_manage_tournament_cycle` راند ۱ را می‌سازد؛ سپس `v_curr_round` را از MAX(round_no) می‌گیرد.
6) **Assign Templates** برای میزهای راند جاری (batch‑aware).
7) **Seat Players** برای هر table_no در راند جاری (batch‑aware، ولی seat به‌صورت per‑table انجام می‌شود).
8) **Round Completion Check**: اگر همه Roomهای ساخته‌شده برای راند جاری finished باشند → `fn_manage_tournament_cycle` را برای عبور به مرحله بعد صدا می‌زند.

---

### Selection / State Gates (شرط‌های مهم)
- فقط تورنومنتی که:
  - یا `registration_open` و `start_at <= now()` → تبدیل به running
  - یا از قبل `running`
  پردازش می‌شود.
- اگر `v_curr_round = 0` باقی بماند → `RETURN`.

---

### Calls (توابعی که صدا می‌زند)
#### 1) مدیریت چرخه تورنومنت (ساخت راند/پیشروی مرحله)
- `tournament.fn_manage_tournament_cycle(p_tournament_id uuid, p_seed bigint)`

#### 2) تخصیص template به میزهای راند (batch-aware)
- `tournament.fn_assign_templates_for_round(
    p_tournament_id uuid,
    p_round_no int,
    p_batch_tables int[]
  )`

#### 3) نشاندن پلیرها روی یک میز مشخص
- `tournament.fn_seat_table_players(
    p_tournament_id uuid,
    p_round_no int,
    p_table_no int
  )`

---

### Writes / Side Effects (اثر روی state)
- `public.tournaments`:
  - ممکن است `status` از `registration_open` به `running` تغییر کند.
- `public.tournament_round_rooms`:
  - وضعیت `status` بر اساس `public.rooms.status` best‑effort به‌روز می‌شود.
- سایر تغییرات (ساخت راندها/assignment/seat) از طریق توابع کال‌شده انجام می‌شود.

---

### Completion Logic (تشخیص پایان راند)
- فقط میزهایی را برای پایان راند حساب می‌کند که `room_id` دارند (یعنی Room واقعاً ساخته شده).
- اگر برای راند جاری هیچ Roomِ ساخته‌شده‌ای وضعیت غیر‑finished نداشته باشد → راند تمام شده محسوب می‌شود و چرخه به مرحله بعد می‌رود.

---

### Failure Modes (حالت‌های شکست مهم)
- `tournament not found` اگر رکورد تورنومنت وجود نداشته باشد.
- `lock_not_available` در صورت عدم دسترسی به قفل (باید توسط caller مدیریت شود).
- خطاهای داخلی توابع کال‌شده (manage/assign/seat) که معمولاً در orchestrator لاگ می‌شوند.

---

### Debug Notes (برای دیباگ سریع)
- اگر تورنومنت شروع نمی‌شود:
  - چک کن `status=registration_open` و `start_at <= now()`.
- اگر راند ساخته نمی‌شود (`v_curr_round=0`):
  - احتمالاً `fn_manage_tournament_cycle` نتوانسته راند ایجاد کند یا داده‌های prerequisite ناقص است.
- اگر بعضی میزها جلو نمی‌روند:
  - `p_batch_tables` را بررسی کن (ممکن است فقط subset اجرا شود).
- اگر پایان راند trigger نمی‌شود:
  - وضعیت `public.rooms.status` برای `room_id`های راند جاری را چک کن (finished یا نه).

