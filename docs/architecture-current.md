### معماری فعلی لابی و گیم‌روم (Lobby + GameRoom)

این سند وضعیت **فعلی** پیاده‌سازی لابی و گیم‌روم در اپ بینگو/دبرنا را بر اساس کد موجود توضیح می‌دهد. هیچ‌کدام از بخش‌های این سند «طرح آینده» نیستند؛ فقط رفتار جاری را توصیف می‌کند.

---

### ۱. فلو فعلی کاربر

- **ورود پلیر به اپ**
  - مسیر روت (`/`) در `app/page.tsx` کاربر را بر اساس لاگین بودن به `/post-login` یا `/auth/login` هدایت می‌کند.
  - بعد از لاگین، برای پلیر مسیر اصلی `"/player/home"` است.

- **رفتن به لابی**
  - در صفحه `player/home`، کاربر روی «Game Room» کلیک می‌کند و به مسیر  
    `app/player/lobby/page.tsx` → `/player/lobby` می‌رود.

- **نمایش لابی**
  - لابی بر اساس **گروه‌بندی قیمت تیکت**، کارت‌هایی (‌`LobbyRoomCard`) را نشان می‌دهد که روی هر کدام تعداد روم‌های `waiting/playing` و تعداد بازیکنان را نمایش می‌دهد.

- **انتخاب یک قیمت/تمپلیت**
  - روی هر کارت لابی که کلیک شود، اکنون:
    - `handleRoomClick(price, templateId)` فقط هدایت می‌کند به:  
      `/player/gameroom?templateId={room_template.id}`

- **ورود به GameRoom**
  - مسیر `app/player/gameroom/page.tsx` پارامترهای `roomId` و `templateId` را از `searchParams` می‌خواند:
    - اگر `roomId` باشد → `GameRoomScreen` در **حالت روم واقعی** لود می‌شود.
    - اگر `roomId` نباشد و `templateId` باشد → `GameRoomScreen` در **حالت تمپلیت** (template mode) لود می‌شود.
    - اگر هیچ‌کدام نباشد → redirect به `/player/lobby`.

- **درون GameRoom**
  - در `GameRoomScreen`:
    - اطلاعات روم/تمپلیت در بالای صفحه نمایش داده می‌شود (قیمت کارت، شمارش‌معکوس، حداقل بازیکن، …).
    - `CardQuantityPanel` اجازه انتخاب تعداد کارت را می‌دهد.
    - `ActiveCardsPanel` لیست بازیکنان و تعداد کارت‌های هرکدام را نشان می‌دهد (برای روم واقعی).
    - `ActiveTablesPanel` لیست سایر روم‌های فعال با همان قیمت را نشان می‌دهد.
  - کاربر با زدن دکمه‌ی خرید کارت، تابع `joinOrCreateRoom` را صدا می‌زند تا:
    - به یک روم `waiting` موجود بپیوندد، یا
    - اگر وجود ندارد روم جدید `waiting` بسازد و وارد آن شود.

---

### ۲. نحوه گرفتن داده در کلاینت

#### ۲.۱. لابی (`app/player/lobby/page.tsx`)

- استفاده مستقیم از `supabase` سمت کلاینت (Anon key):

1. **گرفتن تمپلیت‌ها** از جدول `room_templates`:

   ```ts
   const { data: templates } = await supabase
     .from("room_templates")
     .select("id, price, currency, status")
     .neq("status", "inactive")
     .order("price", { ascending: true });
   ```

2. **گرفتن روم‌های فعال** از جدول `rooms`:

   ```ts
   const { data: roomsData } = await supabase
     .from("rooms")
     .select("card_price, currency, status, id, room_template_id")
     .in("status", ["waiting", "playing"]);
   ```

3. **محاسبه تعداد بازیکنان هر روم** با کوئری روی `tickets`:

   ```ts
   const { data: ticketsData } = await supabase
     .from("tickets")
     .select("room_id, player_user_id")
     .in("room_id", roomIds)
     .in("reservation_status", ["reserved", "confirmed", "consumed"]);
   ```

4. همه این داده‌ها در فرانت گروه‌بندی می‌شود تا یک آرایه‌ی `RoomPriceGroup` ساخته شود.

5. **Polling**: `fetchRooms()` هر ۱۰ ثانیه با `setInterval` دوباره صدا زده می‌شود و state لابی را به‌روزرسانی می‌کند.

#### ۲.۲. GameRoom (`src/screens/GameRoomScreen.tsx`)

- از `services/rooms.ts` و همچنین مستقیم `supabase` استفاده می‌کند.

1. **شناخت کاربر فعلی**:

   ```ts
   const { data: { user } } = await supabase.auth.getUser();
   ```

2. **حالت روم واقعی (با roomId)**:
   - `loadRoomInfo(roomId)`:
     - از جدول `rooms` می‌خواند (`id, room_code, title, status, card_price, currency, countdown_sec, starts_at, ends_at, min_players, max_players, room_template_id`).
     - تعداد بازیکنان فعلی را با یک کوئری count روی `tickets` حساب می‌کند.
   - `loadRoomActiveCards(roomId)`:
     - از `tickets` تمام بلیت‌های `reserved/confirmed/consumed` برای آن روم را می‌گیرد و آن‌ها را بر اساس کاربر گروه‌بندی می‌کند.
     - نام کاربر و nickname را از جدول `users` و `user_profiles` می‌خواند.
   - `loadActiveTables(cardPrice, currency, excludeRoomId?)`:
     - از `rooms` همه روم‌های `waiting/playing` با همان `card_price` و `currency` (به‌جز روم فعلی) را برمی‌گرداند.
     - تعداد بازیکنان و کارت‌ها را با join روی `tickets` به‌صورت دستی محاسبه می‌کند.

3. **حالت تمپلیت (با templateId، بدون roomId)**:
   - در هر بار `fetchRoomData`:
     - ابتدا در جدول `rooms` به دنبال یک روم `waiting` با `room_template_id = templateId` می‌گردد.
       - اگر پیدا شد، با `router.replace("/player/gameroom?roomId=...")` همه را به آن روم هدایت می‌کند.
     - اگر هیچ روم `waiting` نباشد:
       - اطلاعات تمپلیت را از `room_templates` (`id, name, price, currency, countdown_sec, min_players, max_cards_per_player`) می‌خواند.
       - از روی این داده‌ها یک `RoomInfo` ساختگی (`pseudoRoom`) می‌سازد تا UI کار کند (اما هیچ `room_id` واقعی وجود ندارد).
       - countdown را در این حالت روی ۰ می‌گذارد.
       - `loadActiveTables` را با قیمت/ارز تمپلیت صدا می‌زند تا روم‌های موجود با این قیمت نمایش داده شوند.

4. **Polling در GameRoom**:
   - `fetchRoomData(true)` هنگام mount صدا زده می‌شود (با `setLoading(true)`).
   - سپس هر ۵ ثانیه یک بار، `fetchRoomData(false)` فقط داده‌ها را رفرش می‌کند (بدون spinner سراسری).
   - علاوه بر آن، یک افکت جداگانه هر ۱ ثانیه، `countdownSeconds` را کم می‌کند تا شمارش معکوس در UI جلو برود.

---

### ۳. RPCها و فانکشن‌های حساس

#### ۳.۱. `fn_join_or_create_room` (Wrapper فعلی)

- در مایگریشن `20251128091500_guard_fn_join_or_create_room_status.sql`:

  - فانکشن قدیمی به نام `fn_join_or_create_room_base(p_template_id uuid, p_card_count integer, p_password text)` تغییر نام داده شده و منطق اصلی join/create را دارد.
  - Wrapper جدید:

    - وضعیت تمپلیت (`room_templates.status`) را می‌خواند:
      - اگر پیدا نشود → `room template not found`.
      - اگر `status = 'inactive'` → `room template is inactive`.
    - سپس `fn_join_or_create_room_base` را صدا می‌زند و خروجی `room_id, starts_at, ticket_ids` را برمی‌گرداند.

#### ۳.۲. مایگریشن `20251128100000_guard_join_or_create_room_suspension.sql`

- همین Wrapper به‌روزرسانی شده تا:
  - `auth.uid()` را بخواند و اطلاعات کاربر فعلی را از `users` بگیرد.
  - فقط اگر نقش کاربر `player` باشد، محدودیت‌ها اعمال شود:
    - اگر `users.status = 'suspended'` → `RAISE EXCEPTION 'player account suspended'`.
    - سعی می‌کند ایجنت و سوپر را پیدا کند:
      - اول از `player_affiliation (agent_id, super_id)`.
      - اگر نبود، از `parent_id` و نقش‌های مرتبط در `users` (agent/super).
    - اگر ایجنت یا سوپر `status = 'suspended'` داشته باشند →  
      به‌ترتیب `agent account suspended` یا `super account suspended`.

#### ۳.۳. کلاینت `joinOrCreateRoom` در `services/rooms.ts`

- قبل از RPC:
  - تمپلیت را از `room_templates` می‌خواند و اگر:
    - تمپلیت پیدا نشود، یا
    - `status !== 'active'`  
    باشد، خطا می‌دهد: «اتاق مورد نظر پیدا نشد یا غیرفعال است / این اتاق در حال حاضر فعال نیست».

- سپس:

  ```ts
  const { data, error } = await supabase.rpc("fn_join_or_create_room", {
    p_template_id: templateId,
    p_card_count: cardCount,
    p_password: password ?? null,
  });
  ```

- خطاها را به پیام‌های UI نگاشت می‌کند:
  - `invalid room password`
  - `max_cards_per_player exceeded`
  - `no active card pool`
  - `insufficient balance`
  - `player account suspended`
  - `agent account suspended` / `super account suspended`

---

### ۴. رفتار فعلی `templateId` و `roomId` در GameRoom

#### ۴.۱. حالت `roomId` (روم واقعی)

- ورودی: `/player/gameroom?roomId=...`
- رفتار:
  - `loadRoomInfo(roomId)` از `rooms` و `tickets` اسنپ‌شات فعلی را می‌سازد.
  - countdown:
    - اگر `starts_at` ست شده باشد →  
      `diff = max(0, floor((starts_at - now) / 1000))`
    - وگرنه اگر `countdown_sec` روم مقدار داشته باشد، مستقیماً همان استفاده می‌شود.
  - هر ۵ ثانیه داده‌های روم دوباره لود می‌شود (و در بار اول countdown تنظیم می‌شود).
  - هر ۱ ثانیه، countdown روی کلاینت کم می‌شود.

#### ۴.۲. حالت `templateId` (نمای تمپلیت)

- ورودی: `/player/gameroom?templateId=...`
- رفتار:
  - در هر polling:
    1. ابتدا روی `rooms` چک می‌کند آیا روم `waiting` برای این تمپلیت وجود دارد.
       - اگر پیدا شود → redirect به `/player/gameroom?roomId={id}`.
    2. اگر هیچ روم `waiting` نباشد:
       - تمپلیت از `room_templates` خوانده می‌شود.
       - یک `RoomInfo` ساختگی با `status = 'waiting'` و `cardPrice = template.price` ساخته می‌شود.
       - countdown فعلاً ۰ نگه داشته می‌شود (حتی اگر `room_templates.countdown_sec` مقدار داشته باشد).
       - لیست روم‌های فعال دیگر با این قیمت از `rooms + tickets` محاسبه و در `ActiveTablesPanel` نمایش داده می‌شود.
       - `ActiveCardsPanel` خالی است چون روم مشخصی نداریم.

---

### ۵. رفتار فعلی شمارش معکوس (Countdown)

- در حالت `roomId`:
  - شمارش معکوس در شروع از روی `starts_at` یا `countdown_sec` روم محاسبه و در state `countdownSeconds` ذخیره می‌شود (فقط یک بار).
  - یک `useEffect` جداگانه هر ثانیه `countdownSeconds` را کاهش می‌دهد تا به صفر برسد.
  - در رفرش‌های بعدی (هر ۵ ثانیه)، مقدار countdown دوباره محاسبه نمی‌شود (برای جلوگیری از ریست در هر رفرش).

- در حالت `templateId`:
  - تا پیش از ساخته‌شدن یک روم `waiting`، countdown همیشه `0` است.
  - به محض ساخته‌شدن روم `waiting`، redirect به حالت `roomId` اتفاق می‌افتد و countdown از روم واقعی گرفته می‌شود.

> توجه: فعلاً هیچ هم‌ترازی (offset) بین ساعت کلاینت و سرور محاسبه نمی‌شود؛ تنها از `new Date()` کلاینت برای محاسبه تفاوت با `starts_at` استفاده می‌کنیم.

---

### ۶. جداول و ساختار دیتابیس درگیر

- `room_templates`
  - تنظیمات تمپلیت روم: `id`, `name`, `price`, `currency`, `min_players`, `countdown_sec`,  
    `max_cards_per_player`, `commission_rate`, `room_type`, `vip`, `ding_per_number`,  
    `repeatable`, `scheduled_start_time`, `status (active | draining | inactive)`.

- `rooms`
  - نمونه‌های واقعی روم: `id`, `room_template_id`, `room_code`, `status (waiting|playing|finished|...)`,  
    `card_price`, `currency`, `min_players`, `max_players`, `max_cards_per_player`,  
    `countdown_sec`, `starts_at`, `ends_at`, `room_seed`, `room_seed_hash`, `meta`.

- `tickets`
  - بلیت‌های بازیکنان در هر روم: `id`, `room_id`, `player_user_id`, `card_no`,  
    `reservation_status (reserved|confirmed|consumed|...)`, `created_at`, …

- `draws`
  - قرعه‌های بازی (برای آینده‌ی نزدیک در فرانت استفاده خواهد شد، الان بیشتر در مستندات و توابع worker استفاده می‌شود).

- `player_affiliation`
  - نگاشت بازیکن به ایجنت و سوپر (`user_id`, `agent_id`, `super_id`) برای منطق تعلیق و گزارش‌ها.

- `users`
  - کاربران با نقش‌ها (`role = admin|super|agent|player`) و وضعیت (`status = active|suspended|deleted`).

---

### ۷. ریسک‌ها و مشکلات قابل مشاهده در معماری فعلی

- **وابستگی شدید فرانت به جداول خام Supabase**
  - لابی و GameRoom هر دو مستقیم به جداول `room_templates`, `rooms`, `tickets` کوئری می‌زنند.
  - هیچ API واحدی برای «اسنپ‌شات روم» (مشابه `api_get_room_state`) در فرانت استفاده نمی‌شود.

- **دو منبع حقیقت برای منطق تمپلیت و join**
  - هم در فرانت (`services/rooms.ts`) و هم در دیتابیس (`fn_join_or_create_room` wrapper) چک‌های مشابه روی `room_templates.status` انجام می‌شود.
  - این تکرار منطق، ریسک ناهماهنگی در آینده را بالا می‌برد.

- **عدم استفاده از API واحد GameRoomView**
  - مستند `docs/backend/supabese/api_get_room_state.md` یک API JSON واحد برای وضعیت روم تعریف کرده، اما فرانت فعلی مستقیم از چند کوئری جداگانه استفاده می‌کند.

- **Countdown فقط بر اساس ساعت کلاینت**
  - اختلاف ساعت کلاینت/سرور می‌تواند باعث شود countdown با زمان واقعی بازی کاملاً هم‌تراز نباشد.

- **polling چندگانه**
  - لابی هر ۱۰ ثانیه rooms/tickets را poll می‌کند.
  - GameRoom هر ۵ ثانیه داده‌های روم/تمپلیت را از چند منبع می‌گیرد.
  - به‌دلیل نبود یک API واحد، ممکن است در آینده فشار غیرضروری روی Supabase وارد شود.

---

### ۸. فهرست کوتاهی از ناهماهنگی‌ها / نقاط قابل بهبود

1. **شمارش معکوس** فقط در GameRoom از `rooms` استفاده می‌شود، در حالی که در اسناد `api_get_room_state` نیز `starts_at` وجود دارد و می‌تواند منبع واحدی باشد.
2. **حالت templateId** در GameRoom فقط از `room_templates` می‌خواند و pseudoRoom می‌سازد، در حالی که طراحی API کامل برای snapshot روم (rooms + tickets + draws) در اسناد وجود دارد.
3. **منطق تعلیق (suspension)** در LoginForm و `fn_join_or_create_room` و همچنین `services/rooms.ts` پخش شده است؛ هرچند از نظر نتیجه هماهنگ هستند، ولی متمرکز نیستند.
4. **joinOrCreateRoom** در فرانت هنوز مستقیم `supabase.rpc` را صدا می‌زند و از API سمت سرور (Next.js route با service_role) استفاده نمی‌کند.
5. **Polling** به‌جای استفاده از یک API سطح‌بالا (مثلاً `/api/player/gameroom`) هنوز روی چند کوئری جدول خام متکی است.

این سند وضعیت فعلی را مستند می‌کند تا در سندهای Phase 1 هدف و تسک‌ها، مسیر مهاجرت به معماری تمیزتر مشخص شود.


