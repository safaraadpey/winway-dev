### فاز ۱ – معماری هدف لابی و گیم‌روم (بدون Realtime)

این سند **معماری هدف Phase 1** را برای سیستم Lobby + GameRoom توصیف می‌کند.  
Phase 1 فقط از **polling دوره‌ای (مثلاً هر ۵ ثانیه)** استفاده می‌کند و هنوز هیچ Realtime (Listen روی `draws`، …) فعال نیست.

این طراحی بر اساس کد فعلی (مستند در `docs/architecture-current.md`) است، اما رفتار مطلوب را مشخص می‌کند.

---

### ۱. حالت `templateId` – رفتار مورد انتظار

ورودی: `GET /player/gameroom?templateId={room_template.id}`

هدف این حالت: **Preview / Lobby-Detail** برای یک تمپلیت، قبل از این‌که اتاق `waiting` واقعاً ساخته شود.

- **Preview Mode (templateId + بدون waiting room)**
  - کلاینت از یک API واحد (مثلاً `GET /api/player/gameroom?templateId=...`) استفاده می‌کند که `GameRoomView` برمی‌گرداند (بخش ۳).
  - اگر در دیتابیس هیچ روم `waiting` برای این تمپلیت نباشد:
    - `mode = "preview"`.
    - فیلدهای UI از `room_templates` پر می‌شود:
      - `ticket_price`, `currency`, `min_players`, `max_cards_per_player`, …
    - `countdown_seconds = 0` (هیچ start مشخصی وجود ندارد).
    - `active_tables` شامل روم‌های `waiting/playing` با همان قیمت/ارز (از جدول `rooms`) است.
    - هیچ کارت فعالی (`active_cards`) وجود ندارد چون هنوز روم مشخصی نداریم.
    - دکمه‌ی خرید/جوین **فعال است**؛ فشار دادن آن باعث ایجاد/استفاده از `waiting room` می‌شود (بخش ۴).

- **Transition به Waiting Mode**
  - هر ۵ ثانیه، کلاینت همان API را Poll می‌کند:
    - اگر در پاسخ، فیلد `active_room_id` تنظیم شده باشد (روم `waiting` پیدا/ساخته شده)، UI از حالت `preview` به حالت `waiting` می‌پرد و از آن لحظه بر اساس `roomId` رفتار می‌کند.

---

### ۲. حالت `roomId` – رفتار مورد انتظار

ورودی: `GET /player/gameroom?roomId={rooms.id}`

این حالت نشان‌دهنده‌ی یک روم واقعی (در یکی از حالت‌های `waiting`, `running`, `finished`) است.

- **Waiting Mode (room.status = 'waiting')**
  - `GameRoomView` فیلدهای زیر را برمی‌گرداند:
    - `room`: اطلاعات روم (`id, room_code, title, status, card_price, currency, min_players, max_cards_per_player, starts_at, countdown_sec, ...`).
    - `active_cards`: لیستی از بازیکنان و تعداد کارت‌هایشان (از `tickets`).
    - `active_tables`: روم‌های دیگر با همین قیمت‌/ارز.
    - `countdown_seconds`:  
      \[
      \max(0, \lfloor (starts\_at - server\_now) / 1000 \rfloor)
      \]
      با استفاده از offset زمان کلاینت (بخش ۵).
    - `mode = "waiting"`.
  - هر ۵ ثانیه Poll می‌شود تا:
    - `status` روم به `running/finished` تغییر کند،
    - کارت‌های جدید افزوده شوند،
    - countdown به صفر نزدیک شود.

- **Running Mode (room.status = 'playing' یا معادل آن)**
  - `GameRoomView` همچنان از همان API برمی‌گردد:
    - `mode = "running"`.
    - countdown می‌تواند روی صفر ثابت بماند یا بر حسب منطق بازی (مثلاً زمان باقیمانده برای قرعه بعدی) محاسبه شود.
    - `draws` و وضعیت بورد می‌تواند در نسخه‌های بعد به پاسخ اضافه شود.

- **Finished Mode (room.status ∈ {'finished', 'cancelled', ...})**
  - `mode = "finished"`.
  - اطلاعات نهایی روم و کارت‌ها/بردها نمایش داده می‌شود.
  - Polling می‌تواند کمتر یا متوقف شود (بسته به نیاز UI).

---

### ۳. `GameRoomView` – شکل واحد پاسخ

Phase 1 باید یک شکل پاسخ واحد برای GameRoom داشته باشد؛ هم در حالت `templateId` و هم `roomId` از همین ساختار استفاده می‌شود. به‌صورت کلی:

```ts
type GameMode = "preview" | "waiting" | "running" | "finished";

type GameRoomView = {
  mode: GameMode;

  // اگر روم واقعی داریم، این مقدار پر است
  room: {
    id: string | null;
    template_id: string;
    room_code: string | null;
    title: string | null;
    status: string | null;       // waiting / playing / finished / ...
    ticket_price: number;
    currency: string;
    min_players: number | null;
    max_players: number | null;
    max_cards_per_player: number | null;
    starts_at: string | null;
    ends_at: string | null;
  };

  // شمارنده معکوس سمت سرور
  server_now: string;            // timestamp سرور
  countdown_seconds: number;     // بر اساس server_now و starts_at

  // کارت‌های فعال
  active_cards: Array<{
    user_id: string;
    display_name: string;
    card_count: number;
  }>;

  // سایر روم‌های فعال با این قیمت
  active_tables: Array<{
    room_id: string;
    room_code: string;
    players: number;
    card_count: number;
    prize: number;
  }>;
};
```

نکات:

- در حالت `preview`:
  - `room.id = null`, `room.status = null`.
  - `ticket_price` و سایر فیلدها از تمپلیت خوانده می‌شوند.
  - `countdown_seconds = 0`.
  - `active_cards = []`.

- در حالت‌های `waiting/running/finished`:
  - `room.id`، `status` و سایر فیلدها مستقیماً از `rooms` گرفته می‌شوند.
  - `active_cards` از `tickets`، `active_tables` از `rooms + tickets`.

---

### ۴. کشف روم‌های `waiting` (Waiting Room Detection)

در Phase 1، **همه‌ی منطق کشف روم‌های `waiting` باید در بک‌اند/توابع دیتابیس** انجام شود؛ نه مستقیماً در لایه‌ی UI.

- **الگو:**
  - API `GET /api/player/gameroom` (طرح در Phase 1 Tasklist) پارامتر `templateId` یا `roomId` را می‌پذیرد.
  - در حالت `templateId`:
    - تابع سرور:
      1. در جدول `rooms` قدیمی‌ترین روم `waiting` با آن `room_template_id` را پیدا می‌کند.
      2. اگر روم پیدا شد:
         - `mode = 'waiting'` و `room.id = found_room.id`.
      3. اگر پیدا نشد:
         - `mode = 'preview'`, `room.id = null`.
    - در هر دو حالت، `GameRoomView` ساخته می‌شود و به کلاینت برمی‌گردد.

کلاینت فقط نتیجه را نمایش می‌دهد؛ تصمیم‌گیری درباره این‌که «آیا روم waiting موجود است یا نه» نباید مستقیماً بر اساس کوئری روی `rooms` در فرانت انجام شود.

---

### ۵. منطق صحیح Countdown با زمان سرور

برای جلوگیری از انحراف زمانی بین کلاینت و سرور، Phase 1 باید:

- در هر پاسخ `GameRoomView`، فیلد `server_now` (مثلاً `now()` سرور) را برگرداند.
- در اولین پاسخ، کلاینت **offset زمانی** خود را تخمین می‌زند:

```ts
const clientReceivedAt = Date.now();
const serverNow = new Date(view.server_now).getTime();
const offsetMs = clientReceivedAt - serverNow; // حدود اختلاف ساعت
```

- برای نمایش countdown:

```ts
const startsAt = view.room.starts_at ? new Date(view.room.starts_at).getTime() : null;
let countdownSeconds = 0;

if (startsAt) {
  const clientNow = Date.now();
  const serverNowEstimated = clientNow - offsetMs;
  countdownSeconds = Math.max(0, Math.floor((startsAt - serverNowEstimated) / 1000));
}
```

- این مقدار در state نگه داشته می‌شود و هر ثانیه یک‌بار کم می‌شود؛ در هر Poll جدید، فقط در صورتی که اختلاف زیاد باشد می‌توان آن را اصلاح کرد (Phase 1 می‌تواند ساده‌سازی کند: فقط در بار اول و هنگام ورود روم جدید، countdown را از نو محاسبه کند).

---

### ۶. نقش `join_or_create_room` و اتمیک بودن آن

در Phase 1، **تمام منطق ایجاد روم و رزرو بلیت باید در تابع دیتابیسی** (مثل `fn_join_or_create_room_base` / `game_ticket.fn_join_or_create_room_and_reserve_tickets`) باقی بماند:

- دلایل:
  - تضمین اتمیک بودن:
    - ساخت روم `waiting`، اختصاص `room_seed`، انتخاب کارت‌های آزاد از `card_pool_cards`، ایجاد رکوردهای `tickets` و بروزرسانی مالی، همه در یک تراکنش انجام می‌شود.
  - جلوگیری از race condition:
    - استفاده از `FOR UPDATE SKIP LOCKED` و قفل‌های سطری برای کارت‌ها و روم‌ها، فقط در سمت دیتابیس قابل پیاده‌سازی است.
  - سازگاری با RLS:
    - فقط فانکشن‌های `SECURITY DEFINER` اجازه دارند روی `tickets`, `rooms`, `wallets` بنویسند؛ کلاینت نباید مستقیم این جداول را دست‌کاری کند.

**نتیجه:**  
فرانت‌اند در Phase 1 فقط از طریق یک API سروری (مثلاً `POST /api/player/join-or-create-room`) که آن هم `fn_join_or_create_room` را صدا می‌زند، join/create را اجرا می‌کند؛ هیچ منطق ساخت روم/انتخاب کارت در TS/JS نوشته نمی‌شود.

---

### ۷. تفکیک مسئولیت Backend و Frontend در فاز ۱

- **Backend (Next.js API routes + Supabase functions):**
  - تعریف و پیاده‌سازی:
    - `GET /api/player/gameroom` → برگرداندن `GameRoomView`.
    - `POST /api/player/join-or-create-room` → صدا زدن فانکشن دیتابیسی `fn_join_or_create_room`.
  - این APIها:
    - دسترسی به Supabase با `service_role` دارند.
    - RLS و محدودیت‌ها (`status`, `role`, suspension،‌ تمپلیت‌های inactive/draining) را enforce می‌کنند.
    - داده‌های خام از جداول مختلف (`rooms`, `room_templates`, `tickets`, `draws`, `player_affiliation`, ...) را ترکیب می‌کنند و خروجی را در قالب `GameRoomView` برمی‌گردانند.

- **Frontend (React / Next app router):**
  - استفاده از APIها به‌عنوان منبع حقیقت:
    - Lobby برای ساخت کارت‌ها و شمارش روم‌ها از APIهای سطح‌بالا استفاده می‌کند (یا از یک endpoint ساده‌تر مخصوص لابی).
    - GameRoom فقط `GameRoomView` را Poll می‌کند و UI را بر اساس آن رندر می‌کند.
  - مسئولیت فرانت:
    - مدیریت state UI (شیوه نمایش countdown، لیست کارت‌ها/میزها).
    - مدیریت خطاها و نمایش پیام‌ها.
    - هدایت (navigation) بین `/player/lobby` و `/player/gameroom`.

---

### ۸. حالت‌های GameRoom در Phase 1

در Phase 1، چهار حالت اصلی تعریف می‌شود:

- **Preview Mode (`mode = "preview"`)**
  - ورودی معمولاً از `templateId`.
  - هنوز روم `waiting` ساخته نشده است.
  - Countdown = 0.
  - فقط تنظیمات تمپلیت + میزهای فعال بر اساس قیمت.

- **Waiting Mode (`mode = "waiting"`)**
  - یک روم `waiting` واقعی وجود دارد.
  - Countdown تا `starts_at` نمایش داده می‌شود.
  - بازیکن می‌تواند کارت بخرد/به روم بپیوندد.

- **Running Mode (`mode = "running"`)**
  - روم در حال بازی است (`playing`).
  - کارت‌ها و قرعه‌ها در حال آپدیت هستند (در Phase 1 هنوز فقط از طریق Polling).

- **Finished Mode (`mode = "finished"`)**
  - بازی تمام شده است.
  - نتایج نهایی و تاریخچه می‌توانند نمایش داده شوند.

این `mode`ها فقط از سمت سرور در `GameRoomView` تعیین می‌شوند؛ فرانت حق ندارد صرفاً بر اساس `rooms.status` خام، بدون API، خودش mode را استنتاج کند.

---

### ۹. کارهایی که کلاینت در Phase 1 «نباید» انجام دهد

برای جلوگیری از حمله و ناهماهنگی منطق، Phase 1 صراحتاً این محدودیت‌ها را اعمال می‌کند:

- فرانت‌اند **نباید مستقیم**:
  - روی جداول `rooms`, `room_templates`, `tickets`, `draws`, `wallets`, `commissions_log` کوئری منطق‌دار بزند تا تصمیم بگیرد:
    - آیا روم waiting وجود دارد یا نه،
    - آیا کارت آزاد وجود دارد یا نه،
    - آیا countdown باید شروع شود یا خیر.
  - `insert` / `update` / `delete` روی این جداول انجام دهد (به‌جز از طریق RPCهای مجاز با کنترل RLS).

- فرانت‌اند باید:
  - برای تمام تصمیم‌گیری‌های حیاتی (join کردن روم، ساخت روم جدید، شروع countdown، وضعیت تعلیق) فقط به خروجی APIهای سرور (`GameRoomView`, `join-or-create-room`) تکیه کند.
  - اگر به هر دلیلی پاسخ API با حدس UI متفاوت بود، همیشه پاسخ API را منبع حقیقت بداند و state محلی را با آن هم‌تراز کند.

این معماری هدف Phase 1 است که بر اساس پیاده‌سازی فعلی طراحی شده و مسیر مهاجرت از وضعیت کنونی به سمت یک API واحد و امن‌تر برای GameRoom را مشخص می‌کند.


