### Phase 1 – Tasklist for Lobby + GameRoom (Polling Only)

این سند یک **نقشه‌راه اجرایی** برای پیاده‌سازی Phase 1 است؛ هر تسک طوری نوشته شده که در Cursor بتوان آن را مرحله‌به‌مرحله اجرا و تیک زد.

قبل از شروع، حتماً `docs/architecture-current.md` و `docs/phase1-target.md` را مرور کن.

---

### ۱. ایجاد APIهای بازیکن (Backend – Next.js API Routes)

#### ۱.۱. `GET /api/player/gameroom`

**هدف:** برگرداندن یک `GameRoomView` واحد، بر اساس `templateId` یا `roomId`.

- [ ] ایجاد دایرکتوری:
  - `app/api/player/gameroom/route.ts`
- [ ] پیاده‌سازی handler:
  - ورودی از query string:
    - `roomId?: string`
    - `templateId?: string`
  - استفاده از `createServiceClient()` / `supabaseServer` (service_role) مشابه الگوهای Admin API.
  - خواندن اطلاعات کاربر:
    - از `supabase.auth.getUser()` با client معمولی (برای نقش/تعلیق) یا از context آماده اگر وجود دارد.
  - منطق:
    - اگر `roomId` ست شده باشد:
      - از `rooms` + `tickets` + (در صورت نیاز `draws`) داده‌ها را بخوان.
      - `mode` را از روی `rooms.status` به یکی از `"waiting" | "running" | "finished"` نگاشت کن.
    - اگر فقط `templateId` ست شده باشد:
      - در `rooms` به دنبال قدیمی‌ترین روم `waiting` با `room_template_id = templateId` بگرد.
      - اگر پیدا شد:
        - به‌صورت داخلی `roomId = found.id` در نظر بگیر و ادامه بده مثل حالت بالا (mode = "waiting").
      - اگر پیدا نشد:
        - از `room_templates` تنظیمات پایه را بخوان.
        - `mode = "preview"`, `room.id = null`, `countdown_seconds = 0`, `active_cards = []`.
    - در هر دو حالت:
      - `active_tables` را مشابه `loadActiveTables` فعلی، اما در همین API، بر اساس قیمت/ارز محاسبه کن.
      - `server_now = now()` را به خروجی اضافه کن.
  - خروجی:
    - JSON مطابق `GameRoomView` تعریف‌شده در `docs/phase1-target.md`.

#### ۱.2. `POST /api/player/join-or-create-room`

**هدف:** wrap کردن `fn_join_or_create_room` در یک API امن.

- [ ] ایجاد دایرکتوری:
  - `app/api/player/join-or-create-room/route.ts`
- [ ] پیاده‌سازی handler:
  - body:
    - `templateId: string`
    - `cardCount: number`
    - `password?: string | null`
  - احراز هویت:
    - از `supabase.auth.getUser()` با client عمومی (نه service_role) استفاده کن؛ اگر user نداشتیم → 401.
  - فراخوانی فانکشن دیتابیس:
    - با service_role:
      - `fn_join_or_create_room(p_template_id, p_card_count, p_password)`
    - خطاها را به error codeهای واضح (`insufficient_balance`, `template_inactive`, `suspended`, …) نگاشت کن.
  - خروجی:
    - `{ ok: true, roomId, startsAt, ticketIds }` در صورت موفقیت.
    - `{ ok: false, error: 'code', message: '...' }` در صورت خطا.

---

### ۲. تغییرات فرانت برای لابی (LobbyPage)

فایل: `app/player/lobby/page.tsx`

#### ۲.۱. استفاده از API برای داده‌های لابی

- [ ] یک helper جدید در `services/rooms.ts` بساز:
  - `loadLobbyGroups(): Promise<RoomPriceGroup[]>`
  - این تابع به‌جای کوئری مستقیم روی `room_templates`, `rooms`, `tickets`:
    - یا از API جدید (اگر مسیر اختصاصی برای لابی ساختیم) استفاده کند،
    - یا موقتاً هنوز از Supabase استفاده کند ولی به‌صورت متمرکز در service (هدف: در فاز بعد، فقط service عوض شود نه کامپوننت).
- [ ] در `LobbyPage`:
  - منطق موجود `fetchRooms` را به استفاده از `loadLobbyGroups()` تغییر بده.
  - ساختن `RoomPriceGroup` در خود service انجام شود، نه در component.

#### ۲.۲. رفتار کلیک روی روم

- [x] کلیک روی کارت لابی فقط به `/player/gameroom?templateId=...` هدایت می‌کند (قبلاً اعمال شده است).
- [ ] اگر API `GET /api/player/gameroom` آماده شد، بهتر است:
  - قبل از redirect، یک call اولیه بزنیم و در صورت خطا (تمپلیت inactive، تعلیق، …) همان‌جا toast نشان دهیم.

---

### ۳. تغییرات فرانت برای GameRoom (GameRoomScreen)

فایل‌ها: `app/player/gameroom/page.tsx`, `src/screens/GameRoomScreen.tsx`

#### ۳.۱. مهاجرت از `loadRoomInfo / loadRoomActiveCards / loadActiveTables` به `GameRoomView`

- [ ] یک service جدید بساز:

  - در `services/rooms.ts`:

    ```ts
    export type GameMode = "preview" | "waiting" | "running" | "finished";
    export type GameRoomView = { ... } // مطابق docs/phase1-target.md

    export async function fetchGameRoomView(params: { roomId?: string; templateId?: string }): Promise<GameRoomView> {
      const search = new URLSearchParams();
      if (params.roomId) search.set("roomId", params.roomId);
      if (params.templateId) search.set("templateId", params.templateId);

      const res = await fetch(`/api/player/gameroom?${search.toString()}`, { method: "GET" });
      if (!res.ok) throw new Error("failed to load game room");
      return (await res.json()) as GameRoomView;
    }
    ```

- [ ] در `GameRoomScreen`:
  - منطق `fetchRoomData` را بازنویسی کن تا:
    - به‌جای استفاده از `loadRoomInfo` و `loadRoomActiveCards` و `loadActiveTables`، فقط `fetchGameRoomView` را صدا بزند.
    - stateهای لازم (`roomInfo`, `activeCards`, `activeTables`, `countdownSeconds`, `mode`) را از روی `GameRoomView` ست کند.
  - وابستگی مستقیم به Supabase (`supabase.from(...)`) را برای داده‌های روم حذف کن (فقط برای auth می‌توانی نگه داری).

#### ۳.۲. مدیریت Countdown بر اساس `server_now`

- [ ] در state `GameRoomScreen`:
  - `const [serverOffsetMs, setServerOffsetMs] = useState<number | null>(null);`
- [ ] بعد از اولین دریافت `GameRoomView`:

  ```ts
  if (serverOffsetMs === null) {
    const clientReceivedAt = Date.now();
    const serverNow = new Date(view.server_now).getTime();
    setServerOffsetMs(clientReceivedAt - serverNow);
  }
  ```

- [ ] تابع helper برای محاسبه countdown از view:

  ```ts
  function computeCountdown(view: GameRoomView, serverOffsetMs: number | null): number {
    if (!view.room.starts_at) return 0;
    const startsAt = new Date(view.room.starts_at).getTime();
    const clientNow = Date.now();
    const serverNowEst = serverOffsetMs === null ? clientNow : clientNow - serverOffsetMs;
    return Math.max(0, Math.floor((startsAt - serverNowEst) / 1000));
  }
  ```

- [ ] در `fetchRoomData(true)` مقدار اولیه `countdownSeconds` را با این helper محاسبه کن؛ در رفرش‌های بعدی فقط در صورت تغییر حالت (مثلاً از preview → waiting) آن را تنظیم کن.

---

### ۴. بهبود Polling Loop

- [ ] اطمینان حاصل کن که:
  - `setInterval` در `GameRoomScreen` همیشه در `useEffect` وابسته به `roomId/templateId` ساخته می‌شود و در `cleanup` پاک می‌شود.
  - در صورت تغییر `mode` از `"preview"` به `"waiting"` (یا تغییر `roomId`)، interval قدیمی پاک و interval جدید بر اساس state جدید ساخته شود.
- [ ] در لابی، interval ۱۰ ثانیه‌ای:
  - اگر کاربر از `/player/lobby` خارج شد، باید در cleanup `clearInterval` شود (الان همین‌طور است؛ فقط بررسی کد).

---

### ۵. استفاده از API Join-Or-Create از فرانت

فایل: `services/rooms.ts`, `src/screens/GameRoomScreen.tsx`

- [ ] در `services/rooms.ts`:
  - تابع موجود `joinOrCreateRoom` را به دو لایه تقسیم کن:
    - `joinOrCreateRoomApi` که به `/api/player/join-or-create-room` POST می‌زند.
    - یک wrapper کوچک در صورت نیاز برای هندل خطاهای UI (پیام‌های فارسی).
  - استفاده مستقیم از `.rpc("fn_join_or_create_room", ...)` را به API جدید منتقل کن.

- [ ] در `GameRoomScreen`:
  - در `handleAddToList`:
    - به‌جای import `joinOrCreateRoom` که با Supabase کار می‌کند، از نسخه‌ی API-based استفاده کن.
    - اگر API `roomId` جدیدی برگرداند و با `roomId` فعلی فرق داشت، به `/player/gameroom?roomId=...` redirect کن (همان رفتار فعلی).

---

### ۶. سناریوهای تست برای Phase 1

هر سناریو باید هم در UI و هم در لاگ‌ها/دیتابیس چک شود.

#### ۶.۱. سناریوهای Template / Waiting

- [ ] **Template بدون روم فعال**
  - یک تمپلیت فعال با قیمت مشخص بساز.
  - مطمئن شو هیچ روم `waiting` با آن تمپلیت در `rooms` نیست.
  - به `/player/lobby` برو، روی کارت آن قیمت کلیک کن → `/player/gameroom?templateId=...`.
  - انتظار:
    - حالت `preview`: countdown = 0، کارت فعال وجود ندارد، active_tables فقط روم‌های دیگر با همان قیمت (اگر باشند).
    - Poll هر ۵ ثانیه هیچ تغییری در countdown نمی‌دهد.

- [ ] **بعد از ساخت اولین روم waiting**
  - از پنل ادمین یا یک call مستقیم `join_or_create_room`، روم `waiting` برای آن تمپلیت بساز.
  - در Poll بعدی GameRoom:
    - باید به حالت `waiting` با `roomId` واقعی سوئیچ کند (GameRoomView با `room.id`).
    - countdown از روی `starts_at` روم محاسبه و در UI نمایش داده شود.

#### ۶.۲. سناریوهای Join / Buy Cards

- [ ] **اولین خرید کارت از حالت preview**
  - در حالت preview، با `cardCount = 1` روی دکمه «خرید کارت» بزن.
  - انتظار:
    - API `/api/player/join-or-create-room` فراخوانی می‌شود.
    - روم `waiting` ساخته می‌شود (اگر نبود).
    - به `/player/gameroom?roomId=...` redirect می‌شوی.
    - کارت‌های فعال خودت در `ActiveCardsPanel` دیده می‌شود.

- [ ] **خرید کارت بیشتر در روم موجود**
  - در حالت `waiting` با روم مشخص، چند کارت دیگر بخر.
  - انتظار:
    - تعداد کارت‌های تو در UI افزایش می‌یابد.
    - اگر به‌هر دلیل فانکشن روم جدیدی بسازد (edge case)، redirect به `roomId` جدید انجام می‌شود.

#### ۶.۳. سناریوهای تعلیق / درینینگ تمپلیت

- [ ] **پلیر تعلیق‌شده**
  - `users.status = 'suspended'`, `role = 'player'`.
  - تلاش برای ورود (LoginForm) → باید ارور تعلیق ببینی.
  - اگر سشن فعلی داری و روی join کلیک کنی، API `join-or-create-room` باید خطای `player account suspended` بدهد و UI پیام مناسب نشان دهد.

- [ ] **ایجنت/سوپر تعلیق‌شده**
  - `agent.status = 'suspended'` برای پلیر؛ خود پلیر active است.
  - تلاش برای join → خطای `agent account suspended` / `super account suspended`.

- [ ] **تمپلیت در حالت draining / inactive**
  - `room_templates.status = 'draining'`:
    - تمپلیت در لابی نمایش داده می‌شود (طبق تغییرات اخیر فقط `inactive` مخفی است).
    - اگر هیچ روم فعالش نباشد، API باید اجازه ساخت روم جدید را ندهد (وابسته به طراحی نهایی).
  - `room_templates.status = 'inactive'`:
    - لابی نباید تمپلیت را نشان دهد.
    - API `join-or-create-room` باید خطای `template inactive` بدهد.

---

### ۷. موارد «حتماً قبل از Phase 2» باید اصلاح شود

قبل از رفتن به فاز Realtime و پیچیدگی‌های بیشتر، این موارد باید تمام شده باشند:

- [ ] **عدم استفاده مستقیم فرانت از جداول `rooms`, `tickets`, `room_templates` برای منطق بازی**
  - تمام این دسترسی‌ها باید پشت `GameRoomView` و سایر APIهای سطح بالا مخفی شوند.

- [ ] **یکپارچه شدن logic join/create در API**
  - فرانت نباید مستقیماً `.rpc("fn_join_or_create_room")` صدا بزند.
  - تمام خطاها باید در API به کدهای مشخص نگاشت شوند تا بعداً بتوانیم رفتار Realtime را راحت‌تر پیاده کنیم.

- [ ] **Countdown بر اساس زمان سرور**
  - حداقل یک offset ساده بین ساعت کلاینت و سرور محاسبه و استفاده شود.

- [ ] **تمیز شدن polling**
  - هیچ `setInterval` یتیم در کامپوننت‌ها نباشد (همه در cleanup پاک شوند).
  - منطق رفرش فقط در یک جای متمرکز برای هر صفحه باشد (مثلاً `fetchGameRoomView`).

- [ ] **مستندسازی نهایی**
  - پس از اتمام تسک‌ها، `docs/architecture-current.md` به‌روزرسانی شود تا وضعیت واقعی جدید را منعکس کند.

این Tasklist مرجع اصلی اجرای Phase 1 است؛ توصیه می‌شود در Cursor برای هر آیتم، PR/کامیت جداگانه یا حداقل چک‌پوینت متمایز ایجاد شود تا بتوان به‌راحتی بازگشت/دیباگ کرد.


