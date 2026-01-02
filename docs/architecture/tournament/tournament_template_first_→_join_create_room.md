# معماری جدید تورنومنت (هم‌راستا با منطق فعلی Roomها)

این معماری دقیقا مطابق مکانیزم فعلی بازی شماست:
- تا وقتی «اولین پلیر» وارد نشود، **room_id واقعی وجود ندارد**.
- ما فقط **room_template_id** را از قبل آماده می‌کنیم.
- بعد، با نشاندن پلیرها (با همان مسیر استاندارد خرید/نشستن)، روم واقعی ساخته و bind می‌شود.

---

## نقشه‌ی کلی: از کدام به کدام

### A) آماده‌سازی راند (Template-first)

**ورودی:** tournament_id + round_no

**خروجی:** برای هر میز (TRR) یک room_template_id رزرو/اختصاص داده می‌شود (بدون ساخت room واقعی)

```
[tournament.fn_assign_templates_for_round]
        |
        v
public.tournament_round_rooms (TRR)
  - template_id (یا template_password)
  - status = 'templated'
  - room_id = NULL
```

**نکته:** این مرحله را می‌توان قبل از شروع راند (یا هنگام generate bracket) اجرا کرد.

---

### B) نشاندن پلیرها روی میز (Real seat through game path)

**ورودی:** tournament_id + round_no (+ optional table_no)

**خروجی:** برای هر میز، پلیرها با همان مسیر استاندارد بازی وارد می‌شوند و در نتیجه:
- اولین پلیر → room واقعی ساخته می‌شود
- بقیه پلیرها → وارد همان room می‌شوند
- tickets ساخته می‌شود

```
[tournament.fn_seat_table_players]
        |
        v
(public.fn_join_or_create_room)  <-- همان RPC استاندارد بازی
        |
        v
public.rooms + public.tickets
        |
        v
TRR.room_id = <game_room_id>
TRR.seated_players = <count distinct players in tickets>
```

---

## سناریو دقیق: چه زمانی کدام تابع کال می‌شود؟

### سناریو 1) Start Round / آماده‌سازی قبل از شروع

**زمان:** وقتی راند قرار است شروع شود (قبل از باز شدن UI برای پلیرها)

1) `tournament.fn_assign_templates_for_round(tournament_id, round_no)`
   - برای هر table در TRR یک template آزاد انتخاب می‌کند
   - تمپلیت را رزرو می‌کند تا collision کم شود

2) (اختیاری) `tournament.fn_seat_table_players(tournament_id, round_no)`
   - اگر شما می‌خواهید سیستم خودش پلیرها را «پوش» کند داخل تمپلیت‌ها
   - مناسب orchestrator/bot/cron

---

### سناریو 2) Seat-on-demand (اولین پلیر که رسید)

**زمان:** UI یا کاربر واقعی می‌زند «تایید خرید / نشستن»

مسیر UI فعلی:

```
BuyCardsPanel
  -> onConfirm
    -> GameRoomScreen.handleAddToList
      -> joinOrCreateRoom (client)
        -> RPC: public.fn_join_or_create_room(p_template_id, p_card_count)
```

**نتیجه:**
- اگر این template هنوز room فعال نداشته باشد → room ساخته می‌شود
- اگر داشته باشد → پلیر join می‌شود

**اینجا تورنومنت لازم نیست room بسازد.** فقط باید template درست را به پلیر بدهد.

---

### سناریو 3) Admin/Orchestrator Mode (نشاندن گروهی)

**زمان:** بعد از ثبت‌نام و تشکیل assignmentها، سیستم می‌خواهد همه را سریع بنشاند.

1) `tournament.fn_assign_templates_for_round(...)`
2) `tournament.fn_seat_table_players(...)`
   - برای هر assignment:
     - template میز را می‌خواند
     - همان مسیر استاندارد join/create را call می‌کند
   - در پایان:
     - TRR.room_id bind
     - TRR.seated_players sync

---

## مسئولیت هر تابع (با نقش دقیق در زمان)

### 1) `tournament.fn_assign_templates_for_round`
**زمان اجرا:** قبل از seating (قبل از شروع راند یا بلافاصله بعد از bracket)

**کار:**
- برای هر table_no در `tournament_round_rooms` یک **room_template_id آزاد** انتخاب می‌کند
- آن را رزرو/اختصاص می‌دهد
- `TRR.room_id` را دست نمی‌زند

**خروجی:** TRR ها templated می‌شوند.

---

### 2) `tournament.fn_seat_table_players`
**زمان اجرا:** بعد از assign کردن template ها (یا وقتی می‌خواهیم همه را push کنیم)

**کار:**
- assignmentهای هر میز را می‌خواند
- به ازای هر پلیر، همان مسیر استاندارد بازی را invoke می‌کند
- بعد از اولین join، room واقعی ساخته می‌شود و `TRR.room_id` پر می‌شود
- در پایان `TRR.seated_players` با tickets sync می‌شود

---

### 3) `public.fn_join_or_create_room`
**زمان اجرا:** هنگام کلیک پلیر (UI) یا وقتی orchestrator بخواهد پلیر را بنشاند

**کار:**
- اگر template روم فعال ندارد → room بساز
- اگر دارد → join کن
- tickets / card allocation را انجام بده

---

## جدول تصمیم‌گیری سریع (چه چیزی کجا ذخیره شود؟)

- **Template انتخاب شده برای هر میز:** داخل TRR (مثلا `template_id` در meta یا ستون جدا)
- **Room واقعی ساخته شده:** داخل TRR.room_id
- **Seated players:** از روی tickets یا sync‌شده در TRR.seated_players

---

## دیباگ: چی را باید چک کنیم وقتی seated_players صفر است؟

اگر `TRR.room_id` پر است ولی `seated_players = 0`:
1) tickets واقعاً ساخته شده؟ (`tickets where room_id = TRR.room_id`)
2) آیا sync کردن `seated_players` داریم؟ (تابع/تریگر/آپدیت در fn_seat_table_players)
3) آیا status های TRR درست جلو می‌روند؟ (created/templated/seating/seated)

---

## نکته‌ی مهم درباره تمپلیت‌های از قبل ساخته‌شده (۵۰–۱۰۰ عدد)

- بهتر است `room_templates.repeatable = false` یا یک flag رزرو داشته باشند
- یک تابع مثل `tournament.fn_pick_free_room_template` باید:
  - تمپلیت‌هایی را انتخاب کند که **room فعال ندارند**
  - و همزمان تحت قفل انتخاب شوند (`FOR UPDATE SKIP LOCKED`) تا رقابت امن شود

