# Tournament Runtime Execution Chain

این سند، زنجیره‌ی اجرایی تورنومنت را از لحظه‌ی Tick شدن تا Join واقعی پلیرها به Room به‌صورت مرحله‌به‌مرحله توضیح می‌دهد. هدف این سند ایجاد یک مرجع شفاف برای دیباگ، توسعه و بررسی رفتار سیستم است.

---

## 1. Trigger اصلی: Tick تورنومنت‌ها

جریان اجرا از تابع زیر شروع می‌شود:

**`fn_tick_due_tournaments(p_limit, p_seed, p_batch_tables)`**

این تابع مجموعه‌ای از تورنومنت‌هایی را که یا:
- در وضعیت `registration_open` هستند و `start_at` آن‌ها رسیده
- یا در وضعیت `running` قرار دارند

انتخاب می‌کند و به‌صورت batch، برای هرکدام تابع Tick اصلی را فراخوانی می‌کند.

---

## 2. Tick تورنومنت

برای هر تورنومنت منتخب، تابع زیر اجرا می‌شود:

**`tournament.fn_tick_tournament(p_tournament_id, p_seed, p_batch_tables[])`**

مسئولیت‌های اصلی این تابع:
- قفل‌گذاری منطقی روی تورنومنت (برای جلوگیری از اجرای همزمان ناسازگار)
- تغییر وضعیت `registration_open → running` در صورت رسیدن زمان شروع
- همگام‌سازی وضعیت `tournament_round_rooms` با وضعیت واقعی `rooms`
- تصمیم‌گیری برای ساخت راند جدید یا ادامه‌ی راند جاری

اگر هیچ راندی وجود نداشته باشد، یا اگر راند قبلی کاملاً به پایان رسیده باشد، این تابع وارد فاز برنامه‌ریزی راند می‌شود.

---

## 3. برنامه‌ریزی راند (Planning Phase)

در این مرحله تابع زیر صدا زده می‌شود:

**`tournament.fn_manage_tournament_cycle(p_tournament_id, p_seed)`**

این تابع:
- پلیرهای واجد شرایط (Entryها یا Winnerهای راند قبل) را جمع‌آوری می‌کند
- آن‌ها را بر اساس قوانین اندازه‌ی میز (fixed / range) بین میزها تقسیم می‌کند
- رکوردهای زیر را می‌سازد:
  - `tournament_round_rooms` (میزهای فرضی راند)
  - `tournament_round_assignments` (نگاشت پلیر → میز با `trr_id` و `cards_count` اولیه)

در این مرحله هنوز هیچ Room واقعی‌ای ساخته نشده است.

---

## 4. تخصیص Template به میزها

پس از مشخص شدن راند جاری، Tick وارد فاز اجرا می‌شود.

ابتدا تابع زیر اجرا می‌شود:

**`tournament.fn_assign_templates_for_round(p_tournament_id, round_no, p_batch_tables)`**

این تابع برای هر میز که هنوز `room_template_id` ندارد:
- یک Template آزاد و فعال انتخاب می‌کند
- `room_template_id` را روی `tournament_round_rooms` ثبت می‌کند

انتخاب Template از طریق تابع کمکی انجام می‌شود:

**`tournament.fn_pick_free_room_template(...)`**

---

## 5. Seat کردن پلیرها (Execution Phase)

پس از تخصیص Template، برای هر میز راند جاری، تابع زیر فراخوانی می‌شود:

**`tournament.fn_seat_table_players(p_tournament_id, round_no, table_no)`**

این مهم‌ترین نقطه‌ی اجرای واقعی بازی است.

رفتار این تابع:
- فقط ردیف همان میز (`tournament_round_rooms`) را lock می‌کند (نه کل تورنومنت)
- `cards_count` هر پلیر را بر اساس `tournament_entries` نهایی می‌کند
- سپس روی assignmentهای همان میز loop می‌زند
- برای **هر پلیر**، join واقعی انجام می‌دهد

---

## 6. Join واقعی پلیر (System Join)

برای هر پلیر، مسیر واقعی join طی می‌شود از طریق تابع سیستمی:

**`game_core.fn_system_join_or_create_room(p_user_id, p_template_id, cards_count, password)`**

این تابع نسخه‌ی سیستمی مسیر کاربر است و:
- Room را ایجاد یا reuse می‌کند
- Ticket واقعی می‌سازد
- کارت‌ها را رزرو می‌کند
- Wallet Hold و Commission را ثبت می‌کند

در اولین join موفق، `room_id` روی `tournament_round_rooms` ثبت می‌شود و بعد از اتمام loop، تمام assignmentها به این `room_id` متصل می‌شوند.

---

## 7. پایان راند و ادامه‌ی چرخه

پس از seat شدن پلیرها و اجرای بازی:
- وضعیت `rooms` به‌تدریج به `finished` می‌رسد
- در Tickهای بعدی، `fn_tick_tournament` بررسی می‌کند آیا همه‌ی Roomهای راند `finished` شده‌اند یا نه

اگر همه تمام شده باشند:
- دوباره `fn_manage_tournament_cycle` اجرا می‌شود
- راند بعدی ساخته می‌شود
- چرخه از مرحله 3 به بعد تکرار می‌شود

این فرآیند تا پایان تورنومنت ادامه پیدا می‌کند.

---

## جمع‌بندی

این زنجیره یک معماری «رفتاری» است:
- تورنومنت ادای پلیر را درمی‌آورد
- از مسیر واقعی بازی استفاده می‌کند
- بدون شکستن هسته‌ی Game Core

نتیجه: تورنومنت دقیقاً همان رفتاری را دارد که مجموعه‌ای از پلیرهای واقعی داشتند، فقط به‌صورت کنترل‌شده و سیستمی.

