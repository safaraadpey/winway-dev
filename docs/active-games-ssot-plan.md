### Design-to-Implementation Plan: Active Games SSOT + Request Dedup (بدون تغییر کد)

---

## 1) مرزبندی مسئولیت‌ها (Ownership)

- **مالک داده (Single Source of Truth)**: یک ماژول جدید به نام **`ActiveGamesOrchestrator`** (ترجیحاً Provider + internal store) که تنها نقطه‌ی مجاز برای:
  - initial load
  - نگهداری state (rooms + metadata)
  - realtime subscriptions
  - polling fallback/health
  - request dedup / coalescing / throttling
  - instrumentation (init/fetch counters)

- **Consumerهای صرفاً read-only** (هیچ fetch/subscribe/auth داخلشان نباشد):
  - **UI**: `components/MyActiveGames.tsx` (فقط render)
  - **Context API**: `lib/contexts/ActiveGamesContext.tsx` (فقط expose کردن state orchestrator)
  - **Hookهای UI**: یک `useActiveGames()` یا `useActiveGamesContext()` که فقط state را برگرداند (بدون side-effect)
  - **Layout/UI wrapper**: `app/player/PlayerLayoutClient.tsx` فقط مصرف‌کننده (بدون اتصال داده)

- **ماژول‌های خارج از scope مالکیت Active Games**:
  - **Auth/session**: باید در یک لایه‌ی بالاتر resolve شود (نه داخل `fetchActiveRooms`). orchestrator فقط “هویت تاییدشده” را دریافت می‌کند.

---

## 2) طرح معماری مقصد (Target Architecture)

### محل mount orchestrator برای جلوگیری از remount/storm
- **محل mount قطعی**: همان مرز ثابت `/player` یعنی `app/player/layout.tsx` (جایی که الان `ActiveGamesProvider` هست).
- **قید اصلی**: orchestrator نباید در چند صفحه/layout دیگر mount شود؛ فقط یک بار برای کل segment `/player/*`.

### جدا کردن auth/session از مسیر Active Games
- **حالت مطلوب**: Active Games orchestrator به جای `supabase.auth.getUser()` و `getSession()` در هر fetch:
  - از یک **Auth Facade** در سطح بالاتر ورودی می‌گیرد:
    - `userId: string | null`
    - `accessToken: string | null` (برای header Authorization)
    - `authReady: boolean` (یا معادل)
- **رفتار**:
  - اگر `authReady=false` یا `userId=null` → orchestrator **هیچ subscription/polling/fetch** را شروع نمی‌کند و state را به حالت empty/idle می‌برد.
  - روی تغییرات auth (sign-in / sign-out / token refresh) orchestrator فقط یک بار re-init می‌شود.

> نکته اجرایی: چون `GlobalUserStateClient` الآن فقط `BalancesProvider` دارد، یا باید یک AuthProvider مرکزی اضافه شود، یا حداقل یک “auth snapshot” مشترک که هم Balances و هم ActiveGames از آن تغذیه شوند (هدف: حذف auth calls تکراری در هر fetch).

### Realtime: patch state (نه refetch کامل)
- **اصل**: realtime handlerها فقط state را **incremental** تغییر دهند. refetch کامل فقط “last resort” باشد.

- **tickets events (فیلتر شده با userId)**:
  - رویدادهای relevant: `INSERT/UPDATE/DELETE` روی tickets کاربر.
  - **Patch strategy**:
    - از payload، `room_id` را استخراج کن.
    - اگر ticket باعث “فعال شدن” یک room شد (مثلاً ورود به reserved/confirmed/consumed) → room را به `activeRoomIds` اضافه کن و فقط **همان room** را fetch کن (یا minimal endpoint/lookup).
    - اگر ticket باعث “غیرفعال شدن” شد → room را از state حذف کن (یا mark inactive).
  - **Ignore**:
    - رویدادهایی که `room_id` ندارند یا به user مربوط نیستند (با وجود فیلتر، برای safety).

- **rooms events (باید محدود شود)**:
  - وضعیت مطلوب: subscribe فقط به roomهایی که در `activeRoomIds` هستند (یا به کمک فیلتر/کانال‌های جداگانه).
  - اگر محدودسازی subscription سخت/ناممکن بود:
    - **Ignore rule**: اگر `roomId` در state فعلی نیست → ignore کامل.
    - **Patch rule**: اگر در state هست و `status/room_code/card_price/currency` تغییر کرده → فقط همان فیلدها update شوند.
  - **Refetch ممنوع پیش‌فرض**: refetch کامل روی rooms event فقط در شرایط خطای ناسازگاری داده (مثلاً state corrupt / missing fields) و با rate-limit.

### Polling: تبدیل به fallback/health-check
- polling دائمی ۱۲ ثانیه‌ای حذف می‌شود و به یکی از این دو شکل محدود تبدیل می‌شود:
  - **Health-check interval بزرگ** (مثلاً ۶۰–۱۲۰ ثانیه) فقط برای همگام‌سازی احتمالی؛ یا
  - **Conditional polling** فقط وقتی realtime disconnected/error است.
- polling باید با dedup هم‌مسیر شود (هرگز هم‌زمان با realtime-trigger refetch نکند).

### Request Deduplication (الزام معماری)
- orchestrator باید یک “single flight” داشته باشد:
  - اگر fetch در جریان است: triggerهای جدید فقط `dirty=true` بگذارند.
  - بعد از اتمام fetch: اگر `dirty=true` → دقیقاً **یک fetch دیگر** اجرا شود.
- throttling کوچک (مثلاً ۲۵۰–۵۰۰ms) برای coalesce کردن موج رویدادهای realtime.

---

## 3) پلن مهاجرت کم‌ریسک (Step-by-step Migration)

### فاز A — آماده‌سازی و اندازه‌گیری (بدون تغییر رفتار UI)
**هدف**: baseline و قابلیت rollback

- **A1) تعریف “Instrumentation Contract”**
  - شمارنده‌ها: `initCount`, `fetchCountBySource`, `inFlight`, `channelCount`, `pollingState`
  - محل مشاهده: console logs یا یک debug panel کوچک (ترجیحاً فقط در dev)

**Done فاز A**
- می‌توان در ۲۰ ثانیه استفاده معمول داخل `/player` اعداد را ثبت کرد.
- rollback: فقط خاموش کردن instrumentation.

---

### فاز B — ساخت Orchestrator جدید در کنار سیستم فعلی (Shadow)
**هدف**: ساخت اسکلت بدون شکستن چیزی

- **B1) ایجاد `ActiveGamesOrchestratorProvider` (جدید)**
  - هنوز UI از context قدیمی می‌خواند.
  - orchestrator می‌تواند در ابتدا “read-only/idle” باشد یا fetch را خاموش کند.

- **B2) تضمین lifecycle سالم**
  - جلوگیری از leak در async init (guard/cancel token)
  - تضمین: mount/unmount → تعداد channelها به ۰ برگردد.

**خروجی قابل سنجش**
- `channelCount` هرگز از ۱ بالاتر نرود (در prod).
- `initCount` per ورود به `/player` برابر ۱.

**Rollback**
- Provider جدید را موقتاً از layout بردارید.

---

### فاز C — انتقال SSOT بدون تغییر UI (Swap Data Source)
**هدف**: UI همچنان `useActiveGamesContext()` را صدا بزند، اما داده از orchestrator بیاید.

- **C1) `ActiveGamesContext` را به orchestrator وصل کنید**
  - `ActiveGamesProvider` دیگر hook قدیمی را اجرا نکند؛ خروجی orchestrator را publish کند.
  - `components/MyActiveGames.tsx` بدون تغییر باقی بماند.

**خروجی قابل سنجش**
- UI تغییری نکند.
- تعداد requestها به `/api/player/my-active-rooms` قابل کنترل شود.

**Rollback**
- برگشت `ActiveGamesProvider` به استفاده از hook قدیمی.

---

### فاز D — حذف auth calls تکراری از مسیر fetch
**هدف**: orchestrator دیگر per fetch `getUser/getSession` نزند.

- **D1) ایجاد/استفاده از یک Auth Facade در سطح بالاتر**
  - `userId/accessToken/authReady` به orchestrator inject شود.
- **D2) fetch فقط با token تزریق‌شده انجام شود**
  - حذف وابستگی Active Games به auth داخل hook

**خروجی قابل سنجش**
- در ۲۰ ثانیه، تعداد `supabase.auth.getUser/getSession` مربوط به Active Games نزدیک به ۰ (جز init/auth-change).

**Rollback**
- بازگشت به مدل قبلی (token را داخل fetch بگیرید) اما dedupe حفظ شود.

---

### فاز E — تبدیل refetch-on-realtime به incremental patch (هسته‌ی ارزش)
**هدف**: realtime رویدادها state را patch کنند، refetch کامل فقط fallback.

- **E1) tickets → patch membership**
  - اضافه/حذف room در state بدون refetch کل لیست
- **E2) rooms → patch fields فقط برای roomهای active**
  - ignore رویدادهای غیرمرتبط
- **E3) تعریف “resync trigger” محدود**
  - فقط در موارد inconsistency یا هر X دقیقه یک بار

**خروجی قابل سنجش**
- موج تغییرات rooms در سیستم، دیگر requestهای my-active-rooms تولید نکند مگر برای roomهای خود کاربر.
- `fetchCountBySource.realtime` نزدیک به ۰ (به جای آن `patchCount` بالا می‌رود).

**Rollback**
- بازگرداندن handlerها به refetch (اما با rate-limit و dedupe) تا UI نشکند.

---

### فاز F — محدودسازی polling به fallback/health
**هدف**: حذف هم‌پوشانی polling+realtime

- **F1) polling فقط هنگام disconnect**
- یا **F2) polling با interval بزرگ health-check** و فقط اگر آخرین realtime update قدیمی شد.

**خروجی قابل سنجش**
- در realtime سالم: `pollingFetchCount = 0` در ۲۰ ثانیه.
- در realtime قطع: polling فعال می‌شود اما با dedupe.

**Rollback**
- polling کوتاه‌تر برگردد، اما همچنان single-flight برقرار بماند.

---

## 4) معیارهای موفقیت (Success Metrics)

### بودجه شبکه (۲۰ ثانیه استفاده معمول در `/player`)
- **`initCount`**: ≤ **1**
- **requests به `/api/player/my-active-rooms`**: ≤ **1** (حداکثر 2 با یک resync کنترل‌شده)
- **هم‌زمانی fetch**: `maxConcurrentInFlight` = **1**
- **تفکیک منبع fetch**:
  - `initial`: 1
  - `realtime`: 0 (در حالت patch-based)
  - `polling`: 0 (در حالت realtime سالم)

### realtime health
- **تعداد channel فعال**: **0 یا 1**
- **rooms events noise**: رویدادهای rooms خارج از `activeRoomIds` → **0 اثر** (ignore)

### auth-call reduction
- **ActiveGames-related `supabase.auth.getUser/getSession`**:
  - فقط هنگام init/auth-change (نه per fetch)
  - هدف: در ۲۰ ثانیه steady-state → **0**

---

## ریسک‌های اصلی و کنترل آن‌ها

- **ریسک: leak به خاطر async init (StrictMode/dev)**
  - **کنترل**: cancel token/guard + ثبت channel/interval فقط اگر هنوز mounted هستیم.
  - **Done**: unmount همیشه channelCount را صفر می‌کند.

- **ریسک: patch logic ناقص و state drift**
  - **کنترل**: health-check محدود (interval بزرگ) + resync در inconsistency.
  - **Done**: drift با یک resync حل می‌شود بدون burst.

- **ریسک: rooms subscription بدون فیلتر باعث event storm**
  - **کنترل**: ignore rule سخت‌گیرانه (اگر roomId در state نیست → return) + ترجیحاً محدودسازی subscription به active IDs.
  - **Done**: event storm به fetch storm تبدیل نشود.

- **ریسک: rollback سخت**
  - **کنترل**: فاز C (swap source) را با feature flag انجام دهید؛ مسیر قدیمی کنار دست باقی بماند.
  - **Done**: با یک flag می‌توان به hook قدیمی برگشت.

---

## Checklist اجرایی (خلاصه)
- [ ] فاز A: instrumentation و baseline
- [ ] فاز B: orchestrator skeleton + lifecycle safe
- [ ] فاز C: swap data source بدون تغییر UI
- [ ] فاز D: جدا کردن auth/session از fetch
- [ ] فاز E: realtime → incremental patch (tickets + rooms) + resync محدود
- [ ] فاز F: polling fallback/health (بدون overlap)

اگر تأیید کنی، در مرحله بعد می‌توانم همین plan را به یک “Spec قابل تبدیل به PRها” تقسیم کنم: هر فاز = یک PR کوچک با معیار Done/rollback مشخص.

