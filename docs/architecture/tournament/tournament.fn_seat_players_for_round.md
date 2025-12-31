### شرح کامل عملکرد `tournament.fn_seat_players_for_round(tournament_id, round_no)`

این فانکشن «اجراکننده‌ی نشاندن پلیرها» است: برنامه‌ی راند (که قبلاً توسط `fn_manage_tournament_cycle` ساخته شده) را برمی‌دارد و با کمترین اصطکاک، **با تقلید رفتار پلیرهای واقعی**، آن‌ها را داخل روم‌های بازی می‌نشاند.

> ایده‌ی اصلی: ما روم را دستی نمی‌سازیم؛ ما کاری می‌کنیم که **مکانیزم داخلی بازی** (همان `fn_join_or_create_room_*`) روم را بسازد/پیدا کند و برای هر پلیر تیکت ایجاد کند.

---

## ورودی‌ها
- `p_tournament_id` : شناسه تورنومنت
- `p_round_no` : شماره راندی که باید روم‌هایش پر شود

(اختیاری در نسخه‌های حرفه‌ای‌تر)
- `p_limit_players` یا `p_limit_tables` برای اجرای batch (به‌درد cron هر X دقیقه می‌خورد)
- `p_seed` اگر بخواهیم ترتیب صندلی‌دادن ثابت باشد

---

## پیش‌نیازهای داده‌ای
این فانکشن روی این موجودیت‌ها تکیه دارد:

### 1) `public.tournament_round_rooms`
برای هر میز/روم برنامه‌ریزی‌شده در این راند:
- `id` (شناسه میز مجازی)
- `tournament_id, round_no, table_no`
- `room_id` (شناسه روم واقعی در `public.rooms` که بعداً پر می‌شود)
- `target_players` (چند پلیر باید روی این میز باشند)
- `seated_players` (چند پلیر تا الان واقعاً نشسته‌اند)
- `status` (`created | running | finished`) برای وضعیت راند-روم

### 2) `public.tournament_round_assignments`
برای هر پلیر در این راند:
- `(tournament_id, round_no, room_id=trr.id, user_id)`  
  > این `room_id` در این جدول «مجازی» است و به `tournament_round_rooms.id` اشاره می‌کند.
- `cards_count` : تعداد کارت‌هایی که این پلیر باید در هر روم داشته باشد (ثابت در تمام راندها)

### 3) `public.room_templates` + `public.rooms` + `tickets`
- نشاندن پلیرها از طریق همان `fn_join_or_create_room_*` انجام می‌شود.

---

## هدف دقیق فانکشن
برای هر `tournament_round_room` در راند مورد نظر:
1) یک **room_template مخصوص همان میز** داشته باشیم تا پلیرهای آن میز قاطی میزهای دیگر نشوند.
2) پلیرهای assignment آن میز را یکی‌یکی (با تعداد کارت ثابت) وارد مکانیزم join کنیم.
3) وقتی تعداد پلیرهای distinct به `target_players` رسید:
   - `room_id` واقعی را در `tournament_round_rooms` ثبت کنیم
   - `seated_players = target_players`
   - (در صورت نیاز) `status` را از `created` به `running` تغییر دهیم

---

## چرا «room_template مخصوص هر میز» لازم است؟
تابع `fn_join_or_create_room_*` اینطور کار می‌کند:
- اگر یک روم `waiting` با این template وجود داشته باشد → همان را برمی‌دارد
- اگر نباشد → یکی می‌سازد

پس اگر چند میز تورنومنت با **یک template مشترک** کار کنند، همه پلیرها ممکن است وارد **یک روم waiting مشترک** شوند و میزها قاطی شوند.
✅ راه‌حل کم‌اصطکاک: **برای هر میز (table_no) یک template یونیک بسازیم** یا حداقل چیزی یونیک در آن داشته باشیم (مثل password) که عملاً آن میز را از بقیه جدا کند.

---

## مسئله کلیدی: «چطور به جای چندین پلیر، join کنیم؟»
تابع join موجود (`fn_join_or_create_room_*`) از `auth.uid()` استفاده می‌کند.
پس اگر همینطور ساده صدا زده شود، فقط «کاربر جاری» را می‌نشاند.

✅ راه‌حل در Supabase/Postgres:
این فانکشن (به صورت `SECURITY DEFINER`) می‌تواند برای هر پلیر، موقتاً claimهای JWT را تنظیم کند تا `auth.uid()` همان پلیر را ببیند:
- `set_config('request.jwt.claim.sub', <player_uuid>, true)`
- (در صورت نیاز) `set_config('request.jwt.claim.role', 'authenticated', true)`

به این ترتیب **هر loop** مثل این است که «آن پلیر آمده و خودش join زده».

---

## مراحل اجرایی فانکشن (Pipeline)

### 1) قفل‌گذاری و اعتبارسنجی
- تورنومنت را `FOR UPDATE` قفل می‌کند.
- چک می‌کند تورنومنت در وضعیت مجاز است (مثلاً `running`).
- وجود `round_no` و میزهای آن را چک می‌کند.

### 2) انتخاب میزهایی که باید پر شوند
- فقط میزهایی را انتخاب می‌کند که:
  - `room_id IS NULL` (هنوز روم واقعی ندارند) یا
  - `seated_players < target_players`
- ترجیحاً با `FOR UPDATE SKIP LOCKED` تا cron موازی همدیگر را لگد نکنند.

### 3) برای هر میز: آماده‌سازی room_template اختصاصی
- اگر قبلاً برای این (tournament_id, round_no, table_no) template ساخته شده باشد → همان را برمی‌دارد
- اگر نه → یک template می‌سازد با:
  - `room_type = 'tournament'`
  - `price = 1` و currency مناسب (برای کم کردن اثر مالی)
  - `min_players = target_players` (حداقل نفرات)
  - `countdown_sec` مناسب (مثلاً کوتاه/کنترل‌شده)
  - `max_cards_per_player` بزرگ
  - `password` یونیک (مثلاً hash از tid+round+table)

> این template «کانال اختصاصی» همان میز است.

### 4) نشاندن پلیرها روی میز با تقلید `join`
برای هر پلیرِ assignment آن میز (تا پر شدن ظرفیت):
- claimهای `auth.uid()` را روی همان پلیر set می‌کند
- `fn_join_or_create_room_*` را صدا می‌زند با:
  - `p_template_id = template_id این میز`
  - `p_card_count = cards_count` از assignment
  - `p_password = همان password template`
- خروجی تابع join شامل `room_id` واقعی و `ticket_ids` است:
  - `room_id` واقعی را ذخیره می‌کنیم (اولین بار که گرفتیم)

### 5) ثبت `room_id` واقعی روی `tournament_round_rooms`
- وقتی اولین پلیر join کرد، روم واقعی ایجاد/پیدا شد.
- فانکشن:
  - `tournament_round_rooms.room_id = room_id واقعی`
  - `seated_players = تعداد پلیرهای distinct که با موفقیت نشستند`

### 6) تمام شدن میز
- وقتی `seated_players >= target_players`:
  - `seated_players = target_players`
  - می‌تواند `status` را `running` کند (یا همان `created` بماند تا بازی واقعاً شروع شود)

### 7) Idempotency / Retry-safety
- اگر cron دوباره اجرا شد:
  - میزهایی که `room_id` دارند و `seated_players` کامل است را رد می‌کند
  - برای پلیرهایی که قبلاً ticket دارند، تابع join خودش جلوی کارت اضافه (بیشتر از `max_cards_per_player`) را می‌گیرد
  - می‌توانیم یک چک کمکی هم بگذاریم که «این پلیر قبلاً در این room template ticket دارد؟» تا دوباره کاری کم شود

---

## این فانکشن چه چیزهایی را عمداً انجام نمی‌دهد
- منتظر countdown نمی‌ماند (DB نباید sleep کند)
- استارت draw یا تغییر وضعیت `public.rooms` را دستی انجام نمی‌دهد
- محاسبه‌ی winner / advance را انجام نمی‌دهد (این کار بعد از finish شدن روم‌ها و توسط `fn_manage_tournament_cycle` در call بعدی انجام می‌شود)
- settlement مالی نهایی (کمیسیون/جوایز) را انجام نمی‌دهد (آن مرحله «آخر تورنومنت» است)

---

## نحوه استفاده در سناریوی شما (Cron/Edge Function)
یک Edge Function/cron هر X دقیقه این دو مرحله را اجرا می‌کند:
1) `tournament.fn_manage_tournament_cycle(tid, seed)` → اگر لازم بود راند بعد را برنامه‌ریزی می‌کند
2) `tournament.fn_seat_players_for_round(tid, round_no)` → میزهای همان راند را به تدریج پر می‌کند

وقتی همه میزها پر شدند، بازی طبق مکانیزم خودش (min_players + countdown) شروع می‌شود.

---

## نکته مهم درباره محدودیت «تعداد پلیر در روم»
چون join فعلی شما `max_players` را enforce نمی‌کند، کنترل ظرفیت در این روش عملاً بر عهده‌ی تورنومنت است:
- ما **فقط به اندازه target_players پلیر distinct** روی یک template خاص می‌نشانیم
- با template یونیک، پلیرهای میزهای دیگر وارد این روم نمی‌شوند

پس به max_players داخلی نیاز نداریم؛ ظرفیت را با «کانال‌سازی template» کنترل می‌کنیم.

