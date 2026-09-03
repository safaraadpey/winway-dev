# نمای کلی پروژه WinWay / DingMoney — ارزیابی DevOps

**تاریخ اسکن:** ۳ سپتامبر ۲۰۲۶  
**ریپوزیتوری:** یک Git monorepo (`dingmoney-bingo`، نسخه `0.1.0`)  
**محصول:** پلتفرم بازی موبایل/PWA (Housie / Bingo 90 توپی) با پول واقعی، تورنومنت، کیف پول ریالی/کریپتو، سلسله‌مراتب اپراتور (admin → super → agent → player)

این سند بر اساس **کد واقعی ریپو** نوشته شده است، نه طرح هدف مهاجرت پوشه (`apps/web`). مسیر Next.js هنوز ریشهٔ ریپو است.

---

## خلاصه اجرایی برای DevOps

| موضوع | وضعیت فعلی |
|--------|-------------|
| مدل استقرار | **Monorepo + چند سرویس جدا** (نه میکروسرویس کامل، نه تک‌فرآیند) |
| فرانت/BFF | Next.js ۱۴ روی **Vercel** (یک بیلد، چند دامنه) |
| Game Loop بینگو | Node ۲۰ روی **Railway** (Docker) |
| ورکرهای پس‌زمینه | Node ۲۰ روی **Railway** (Nixpacks) |
| منبع حقیقت | **PostgreSQL** (پروژهٔ Supabase) |
| Realtime | **Supabase Realtime** (WebSocket) — فقط تازگی UI |
| صف پیام خارجی | **وجود ندارد** (Kafka / RabbitMQ / NATS / BullMQ نیست) |
| CI/CD در ریپو | **وجود ندارد** (نه GitHub Actions، نه GitLab CI) |
| Kubernetes / Helm | **وجود ندارد** |
| PM2 / Nginx در ریپو | **وجود ندارد** |
| IaC استقرار | **وجود ندارد** (`railway.toml` نیست؛ تنظیمات در داشبورد) |

---

## ۱. پشته فنی (Tech Stack)

### ۱.۱ زبان و ران‌تایم

| لایه | زبان | ران‌تایم |
|------|------|----------|
| وب + API BFF | TypeScript `^5.5.3` | Node (Vercel) — هدف کامپایل `ES2017` |
| گیم‌انجین بینگو | TypeScript | **Node ≥ 20** (`node:20-alpine` در Docker) |
| ورکرها | TypeScript اجرا با `tsx` | **Node ≥ 20** |
| منطق مالی/بازی در DB | PL/pgSQL | PostgreSQL (Supabase) |
| استایل | CSS Modules + Tailwind `^3.4.4` | PostCSS + Autoprefixer |

باندلر فرانت: Webpack داخلی Next.js ۱۴. بیلد انجین: `tsc` → `dist/index.js`.

### ۱.۲ فرانت‌اند

| مورد | مقدار |
|------|--------|
| فریم‌ورک | **Next.js `^14.2.35`** (App Router) |
| UI | **React `^18.3.1`** + `react-dom` |
| انیمیشن | `framer-motion` `^12.23.24` |
| اعلان | `react-hot-toast` |
| تاریخ شمسی | `react-multi-date-picker` / `react-date-object` |
| صدا | `use-sound`، `nosleep.js` |
| QR | `qrcode.react` |
| PWA | `public/sw.js` + `manifest-player.webmanifest` / `manifest-admin.webmanifest` |
| پوستهٔ UI | موبایل ثابت `max-w-[390px]`، زبان `fa` |

Next.js هنوز به `apps/web/` منتقل نشده؛ آن مسیر فقط placeholder است. `transpilePackages` ریشه: `@dingmoney/deposit-core`، `@dingmoney/backgammon-engine`، `@dingmoney/leo-behavior-core`.

سطوح UI داخل **یک فرآیند Next**:

- بازیکن: `app/player/**`، `src/screens/**`
- ادمین: `app/admin/**`
- ایجنت/سوپر: `app/agent/**`
- Dev Panel: `app/dev-panel/**`
- مهمان تماشا: `app/api/watch/**`

جداسازی ادمین **با هاست** است (`middleware.ts`)، نه با ریپو یا بیلد جدا.

### ۱.۳ بک‌اند و سرویس‌ها

| سرویس | پکیج npm | فریم‌ورک HTTP | استقرار |
|--------|----------|----------------|---------|
| وب + BFF | ریشه `dingmoney-bingo` | Next Route Handlers (`app/api/**`) | Vercel |
| Bingo Engine | `@dingmoney/bingo-engine` | `node:http` خام (بدون Express/Fastify) | Railway Docker |
| Crypto Deposit Worker | `@dingmoney/crypto-deposit-worker` | `node:http` فقط health | Railway Nixpacks |
| Leo Engine Worker | `@dingmoney/leo-engine-worker` | `node:http` فقط health | Railway Nixpacks |
| Business Backup | `@dingmoney/business-backup-worker` | `node:http` فقط health | Railway Nixpacks |
| Performance Snapshot | `@dingmoney/performance-snapshot-worker` | `node:http` فقط health | Railway Nixpacks |

کتابخانه‌های دامنه (سرویس HTTP جدا **نیستند**):

| پکیج | نقش |
|------|------|
| `@dingmoney/backgammon-engine` | قوانین تخته‌نرد (pure domain) — API داخل Next |
| `@dingmoney/tic-tac-toe-engine` | قوانین دوز — API داخل Next |
| `@dingmoney/deposit-core` | اسکن/شارژ کریپتو مشترک وب و ورکر |
| `@dingmoney/leo-behavior-core` | پروفایل رفتار بازیکن‌های Leo |
| `@dingmoney/shared-*` / `game-contracts` | داربست قرارداد؛ هنوز runtime export کامل ندارند |

Workspaces ریشه:

```
packages/*
apps/workers/*
apps/engines/backgammon
apps/engines/tic-tac-toe
```

**`apps/engines/bingo` داخل workspaces نیست** و `package-lock.json` جدا دارد.

### ۱.۴ داده و کلاینت‌های DB

| کتابخانه | نسخه | استفاده |
|----------|------|---------|
| `pg` | `^8.21.0` (وب) / `^8.13.1` (انجین/ورکر) | Direct PostgreSQL |
| `@supabase/supabase-js` | `^2.81.1` | Auth، Realtime، Storage، RPC غیر بحرانی |
| `@supabase/ssr` | `^0.12.0` | نشست cookie در middleware |
| `@upstash/redis` | `^1.38.1` | Redis REST (Hot Watch کریپتو + هماهنگی) |
| `ioredis` | `^5.6.1` | فقط bingo-engine — پروتکل Redis (`REDIS_URL`) |

### ۱.۵ ارتباط Real-time

**Socket.IO، gRPC، WebRTC، SSE اختصاصی در پروژه نیست.**

| مکانیزم | کتابخانه | نقش |
|---------|----------|------|
| **Supabase Realtime** | `@supabase/supabase-js` روی WebSocket | تازگی UI: موجودی، روم زنده، بلیط، پایان بازی، تخته‌نرد، واریز کریپتو |
| **WebSocket در Node** | `ws` `^8.21.0` | ترانسپورت Realtime برای انجین و ورکر کریپتو (Node ۲۰ `WebSocket` سراسری ندارد) |
| **Polling دستی** | `setInterval` / `setTimeout` | لابی، زنده بودن روم، fallback وقتی Realtime قطع است |
| **HTTP snapshot** | Next `/api/player/*` یا Engine `/v1/*` | منبع اصلاح UI پس از قطع Realtime |

کانال‌های Realtime مشاهده‌شده در کد:

| کانال | فایل / نقش |
|--------|-------------|
| `wallet_balance_changes_{userId}` | `useBalances` / `useWalletBalances` — جدول `wallets` |
| `live-room-{roomId}` | `LiveRoomScreen` |
| `gameroom_live_probe_{roomId}`، `template_{id}_rooms`، `room_{id}_tickets`، `room_{id}_status` | `GameRoomScreen` |
| `game_end_rooms_{roomId}`، `game_end_tickets_{userId}` | `GameEndResultsListener` |
| `my_active_rooms_{userId}` | `ActiveGamesOrchestrator` |
| `backgammon:{sessionId}` | جلسه تخته‌نرد |
| `crypto_deposit:{userId}` | اطلاع شارژ کریپتو |
| `draw-processor-job-wake` | بیدار کردن draw-processor روی INSERT `draw_jobs` |

قانون معماری: Realtime **نمایش** است؛ تصمیم مالی و نتیجهٔ بازی از **snapshot PostgreSQL** می‌آید.

### ۱.۶ چت

صفحهٔ `/messages` فقط placeholder است («در حال توسعه»). **سرویس چت زنده، WebSocket چت، یا صف پیام چت وجود ندارد.** پشتیبانی بازیکن: FAQ + بررسی قرعه + مشاهده کارت‌ها (`app/player/support`). لینک واتساپ در کد هست ولی فعلاً مخفی است.

---

## ۲. داده و حالت (Data & State Management)

### ۲.۱ دیتابیس اصلی — Relational (PostgreSQL)

تنها دیتابیس عملیاتی: **PostgreSQL روی Supabase**. NoSQL / Graph DB در ریپو استفاده نشده است.

اتصال وب: `lib/pg.ts` — ترجیح **transaction pooler پورت `6543`** (`pgbouncer=true`) چون session pooler پورت `5432` سقف کلاینت پایینی دارد.

اسکیماهای canonical (`sql/baseline/001_schema.sql` + مایگریشن‌های بعدی):

| Schema | نقش |
|--------|------|
| `public` | کاربران، روم، کیف پول، بلیط، گزارش، KYC، … |
| `game_core` | join، draw jobs، marks، seeds |
| `game_finance` | `fn_wallet_apply_delta`، settle، کمیسیون بلیط |
| `game_pool` | استخر کارت |
| `game_ticket` / `game_admin` / `game_archive` / `game_trash` | دامنهٔ بلیط/ادمین/آرشیو |
| `tournament` | چرخه، seating، قفل، payout |
| `deposit` | intent شارژ ریالی/کریپتو |
| `platform` | نشست/گزارش پلتفرم (مهاجرت P5) |
| `backgammon` | جلسات تخته‌نرد |
| `tic_tac_toe` | مینی‌گیم دوز |
| `monitor` / `load_test` | مانیتور و تست بار |

پروژهٔ جدا **`winway_backup`**: اسکیما `archive.*` — فقط نوشتن ورکر بکاپ؛ Production را read-only می‌خواند (`backup_reader`).

اکستنشن‌های baseline: `pgcrypto`، `uuid-ossp`. روی هاست: `pg_cron` (نگهداری)، اختیاری `pg_stat_statements` / `pg_net` / `supabase_vault`.

Auth جدا از جداول اپ: **Supabase Auth** (`auth.users`) + تریگر `handle_new_user`.

Storage: **Supabase Storage** (آواتار، بنر، تصویر KYC).

### ۲.۲ Caching و In-Memory

| لایه | فناوری | چه چیزی ذخیره می‌شود | چه چیزی ذخیره **نمی‌شود** |
|------|--------|----------------------|---------------------------|
| **Upstash Redis** | REST (`@upstash/redis`) و/یا `ioredis` | قفل leader، heartbeat replica، lease روم، Hot/Warm/Confirm Watch کریپتو، price lock | موجودی کیف پول، نتیجهٔ settle |
| **RAM انجین** | `RoomStateManager` + bitmask کارت | حالت زندهٔ روم بین قرعه‌ها | حقیقت مالی |
| **IndexedDB مرورگر** | `lib/cardPool/indexedDb.ts` | تعریف استخر کارت (فلگ `NEXT_PUBLIC_USE_CARD_POOL_CACHE`) | موجودی / برنده |
| **حافظهٔ فرآیند** | Map در `cryptoRedis` اگر Upstash نباشد | fallback لوکال اسکنر کریپتو | تولید |
| **React Context** | Session، Balances، ActiveGames، Theme، Tour | رندر UI | حقیقت کسب‌وکار |

پیشوند کلید انجین: `ding:game-engine:*`  
کلیدهای کریپتو: `active_crypto_addresses`، `crypto_watch:warm`، `crypto_watch:confirm`، `price_lock:*`

Redis لوکال برای تست چند-replica: تصویر `redis:7-alpine` پورت **6379** در `apps/engines/bingo/docker-compose.multi-replica.yml`.

Zustand / Redux / React Query / SWR **نیستند**. کش کلاینت عمدتاً Context + poller دستی است.

### ۲.۳ صف و Message Broker

**هیچ broker خارجی وجود ندارد.** الگوی صف:

| صف | پیاده‌سازی | مصرف‌کننده |
|----|------------|-------------|
| قرعه | جدول PostgreSQL `draw_jobs` + تریگر enqueue | `draw-processor` (و historically `pg_cron`) |
| تورنومنت | tick روی جداول `tournament.*` | `tournament-orchestrator` |
| Leo / dev-player | جداول زمان‌بندی در PG | ورکر Leo / نقش‌های dev-player انجین |
| شارژ ریالی گیرکرده | وضعیت `deposit.intents` | `POST /api/cron/deposit-reconcile` |
| هماهنگی چند-replica | Redis distributed lock (NX/TTL) | scheduler، draw-processor، tournament، room-loop |

اتمیسیتهٔ مالی: RPCهای `SECURITY DEFINER` داخل تراکنش PostgreSQL (`fn_wallet_apply_delta` با کلید idempotency).

---

## ۳. ساختار و معماری (Architecture & Services)

### ۳.۱ نمودار استقرار فعلی

```
                    ┌─────────────────────────────────────────┐
                    │              مرورگر / PWA                 │
                    │  dingmoney.org  |  admin.dingmoney.org    │
                    │  dev.dingmoney.org | admin.dev.*          │
                    └────────────┬───────────────┬──────────────┘
                                 │ HTTPS         │ WSS Realtime
                                 ▼               ▼
                    ┌──────────────────┐   ┌────────────────────┐
                    │ Vercel (Next.js) │   │ Supabase Realtime  │
                    │ region: dub1     │   │ Auth + Storage     │
                    │ :443             │   └─────────┬──────────┘
                    └────────┬─────────┘             │
         REST /v1 JWT        │                       │
         NEXT_PUBLIC_        │     DATABASE_URL      │
         GAME_ENGINE_URL     │     (pg :6543)        │
                             ▼                       ▼
                    ┌──────────────────┐   ┌────────────────────┐
                    │ Railway Docker   │   │ PostgreSQL SoT     │
                    │ bingo-engine     │──►│ wallets, rooms,    │
                    │ :8080            │   │ deposit, tournament│
                    └────────┬─────────┘   └─────────▲──────────┘
                             │ REDIS_URL             │
                             ▼                       │
                    ┌──────────────────┐             │
                    │ Upstash Redis    │             │
                    │ :6379 TLS        │             │
                    └──────────────────┘             │
                                                     │
                    Railway Nixpacks ────────────────┘
                    ├── crypto-deposit-worker  :8080
                    ├── leo-engine-worker      :8081
                    ├── business-backup        :8080  (+ winway_backup PG)
                    └── performance-snapshot   :8081 (یا $PORT)
```

ارتباط **Next ↔ Engine فقط HTTP** است. `tsconfig.json` ریشه مسیر `apps/engines/bingo` را exclude می‌کند.

### ۳.۲ پروکسی‌ها، دامنه‌ها و پورت‌ها

| نقش | لایه پروکسی | پورت داخلی | پورت عمومی |
|-----|-------------|------------|------------|
| وب بازیکن/ادمین | **Vercel Edge / CDN** | Next `PORT` (پلتفرم) | **443** |
| Game Engine | **Railway HTTP proxy** | `GAME_ENGINE_HTTP_PORT` پیش‌فرض **8080** | **443** روی `*.up.railway.app` |
| ورکرها | Railway proxy (health) | ۸۰۸۰ یا ۸۰۸۱ یا `$PORT` | معمولاً داخلی |
| Postgres مستقیم | — | **5432** session | فقط از سرورها |
| Postgres pooler | Supabase PgBouncer | **6543** | `*.pooler.supabase.com` |
| Redis | Upstash | **6379** (`rediss://`) یا REST HTTPS | TLS |
| Realtime | Supabase | WSS **443** | `*.supabase.co` |
| Redis لوکال compose | — | **6379** | localhost |
| Next لوکال | — | **3000** | localhost |
| HamiPay | HTTPS خارجی | — | درگاه شاپرک |

`vercel.json` فقط منطقه را مشخص می‌کند: `"regions": ["dub1"]` (دوبلین).

دامنه‌های مشاهده‌شده / پیش‌فرض کد:

| محیط | بازیکن | ادمین | Engine (نمونه از audit ۲۰۲۶-۰۷-۳۱) |
|------|--------|-------|-------------------------------------|
| Production | `www.dingmoney.org` / `dingmoney.org` | `admin.dingmoney.org` | `https://winway-production.up.railway.app` |
| Staging | `dev.dingmoney.org` | `admin.dev.dingmoney.org` | `https://winway-dev-production.up.railway.app` |
| Local | `http://localhost:3000` | همان origin `/admin` | `http://localhost:8080` |

ریدایرکت هاست (`middleware.ts`):

- `MAIN_APP_HOST` پیش‌فرض `dingmoney.org`
- `ADMIN_APP_HOST` پیش‌فرض `admin.dingmoney.org`
- مسیرهای `/admin` و `/dev-panel` روی هاست اصلی → HTTPS به هاست ادمین

CORS انجین: `GAME_ENGINE_CORS_ORIGINS` (لیست origin یا `*`). متدها: `GET, POST, OPTIONS`. هدرها: `Authorization, Content-Type`. `/v1/*` نیاز به **Supabase JWT Bearer** دارد.

Health:

| سرویس | مسیر | هویت JSON |
|--------|------|-----------|
| bingo-engine | `GET /health` liveness، `GET /ready` readiness | `"service":"bingo-engine"` |
| crypto-deposit | `GET /health`، `GET /ready` | `"service":"crypto-deposit-worker"` |
| leo-engine | هر مسیر روی پورت health | متن `leo-engine ok` |
| business-backup | `GET /health` | — |
| performance-snapshot | هر مسیر | `"service":"performance-snapshot"` |

### ۳.۳ منطق بازی (Game Loop) — Bingo

هویت فرآیند: `bingo-engine`  
ورود: `apps/engines/bingo/src/index.ts`  
فلگ ران‌تایم: `GAME_RUNTIME` ∈ `legacy_db` | `hybrid` | `engine` (تولید مورد انتظار: `engine`)

نقش‌ها (`GAME_ENGINE_ROLES`):

| نقش | مسئولیت |
|-----|---------|
| `scheduler` | waiting → playing، insert draw، `next_draw_at` |
| `draw-processor` | مصرف `draw_jobs`، mark، evaluate (per-room actor) |
| `room-loop` | game clock داخل actor روم (هدف p95 قرعه < ۳ث) |
| `tournament-orchestrator` | tick تورنومنت و seating |
| `dev-player-scheduler` / `dev-player-processor` | بازیکن‌های مصنوعی |

`SCHEDULER_ENABLED` پیش‌فرض **false** (لوکال با Railway تداخل نکند). روی Railway باید `true` باشد.

API فرمان (`GAME_ENGINE_API=true`، همان پورت ۸۰۸۰):

- `GET /v1/lobby`
- `GET /v1/gameroom`
- `GET /v1/live-room`
- `GET /v1/rooms/{id}/state`
- `POST /v1/rooms/join`

کیف پول در انجین UPDATE مستقیم نمی‌شود؛ settle از RPC دیتابیس است.

مسیر جایگزین (فلگ خاموش): Next `app/api/player/lobby-snapshot`، `gameroom`، `live-room` مستقیم به PG.

مالکیت clock روی DEV: Railway engine؛ `pg_cron`های `bingo_heartbeat` / `bingo_draw_worker_*` باید mutex-disabled باشند تا double-drive نشود. `pg_cron` نگهداری (janitor، card-pool، partition) باقی می‌ماند.

### ۳.۴ اتاق‌ها (Rooms)

- قالب: `room_templates` (قیمت، countdown، درصد خط/فول، `ding_per_number`)
- نمونه: `rooms` با وضعیت `waiting | playing | settling | finished | cancelled | …`
- Join: `fn_join_or_create_room` / Engine `POST /v1/rooms/join` → hold کیف پول per ticket
- هماهنگی replica: Redis lease (`ROOM_LOOP_LEASE_SEC` پیش‌فرض ۳۰) + `ENGINE_ID`
- لغو waiting: API بازیکن `cancel-waiting-room`
- قفل سراسری ثبت‌نام: `app_runtime_flags` / API admin و player

تخته‌نرد و دوز **روم بینگو نیستند**: جلسه در اسکیما خود + API Next (`/api/player/backgammon/*`، `/api/player/tic-tac-toe/*`) + Realtime برای بک‌گمون.

### ۳.۵ سیستم مالی / پاداش

| جریان | محل اجرا | منبع حقیقت |
|--------|----------|-------------|
| شارژ ریالی HamiPay | Next API (`lib/deposit/*`) — **ورکر جدا نیست** | `deposit.intents` → `fn_post_credit` → `fn_wallet_apply_delta` |
| شارژ کریپتو USDT/TRX/BNB | ورکر `crypto-deposit` + همان RPC | مشاهده زنجیره + intent |
| Hold/capture بلیط | RPC هنگام join/settle | `transactions` |
| جایزه خط/فول | `fn_finish_room_and_settle` | کیف پول + کمیسیون |
| Ding (امتیاز غیربانکی) | تریگر پس از `draws.processed_at` | `ding_balances` |
| کمیسیون agent/super | RPC توزیع بلیط/تورنومنت | `commissions_log` |
| برداشت ریالی/کریپتو | API player + تأیید admin | جداول withdrawal |
| تنظیم دستی ادمین | `/api/admin/wallet/adjust` | service_role |
| آشتی مالی | `/api/cron/finance-reconcile` | Bearer `CRON_SECRET` |

واحد: UI خرید **ریال**؛ کیف پول PG **تومان** (۱ تومان = ۱۰ ریال).

Callback ریالی: **webhook سرور-به-سرور نیست**. مدل: ساخت intent → ریدایرکت مرورگر → `/payment/callback` → poll وضعیت HamiPay → شارژ idempotent. پشتیبان: cron reconcile.

گیم‌انجین در مسیر شارژ **صدا زده نمی‌شود**.

### ۳.۶ چت و پشتیبانی

چت درون‌برنامه‌ای پیاده نشده. پشتیبانی: محتوای استاتیک FAQ، ابزار بررسی قرعه، KYC (آپلود تصویر به Storage + بررسی ادمین).

---

## ۴. وضعیت فعلی DevOps و کانفیگ‌ها

### ۴.۱ Docker

| فایل | وجود | نقش |
|------|------|------|
| `apps/engines/bingo/Dockerfile` | **بله** | multi-stage `node:20-alpine`، `EXPOSE 8080`، `CMD node dist/index.js` |
| Dockerfile ریشه / وب / ورکرها | **خیر** | ورکرها Nixpacks |
| `apps/engines/bingo/docker-compose.multi-replica.yml` | **بله** | تست محلی ۳ replica + Redis ۷ — **نه تولید** |
| Compose ریشه | **خیر** | — |

Dockerfile انجین context را `apps/engines/bingo` فرض می‌کند (`COPY package.json` همان پوشه). Root Directory Railway باید همین مسیر باشد.

### ۴.۲ Kubernetes / Helm

جستجو در ریپو: **هیچ** manifest (`k8s/`، `kubernetes/`، Helm Chart، `values.yaml` استقرار) وجود ندارد.

مقیاس افقی فعلی: چند replica **Railway** برای bingo-engine با Redis leader lock (`COORDINATION_STRICT`، `ENGINE_REPLICA_COUNT`). تا پاس شدن gate بهتر است replica=۱ بماند (`docs/runbooks/horizontal-scaling-deploy-gate.md`).

### ۴.۳ CI/CD

| سیستم | وضعیت در ریپو |
|--------|----------------|
| `.github/workflows/` | **نیست** |
| `.gitlab-ci.yml` | **نیست** |
| CircleCI / Azure Pipelines / Jenkinsfile | **نیست** |
| Vercel Git integration | استقرار از push — تنظیمات **خارج از ریپو** (داشبورد) |
| Railway Git/watch | استقرار از push — **داشبورد**؛ `railway.toml` / `railway.json` **نیست** |

تست‌های موجود **دستی/اسکریپت** هستند (`npm run test:*` در ریشه، تست‌های `tsx` انجین). pipeline خودکار lint/test/deploy در git تعریف نشده.

`vercel.json` کرون Vercel تعریف نمی‌کند. مسیرهای `app/api/cron/*` با `CRON_SECRET` محافظت می‌شوند و باید از بیرون (یا داشبورد Vercel Cron جدا) صدا زده شوند:

- `POST /api/cron/deposit-reconcile`
- `POST /api/cron/finance-reconcile`
- `POST /api/cron/crypto-scan-active`
- `POST /api/cron/crypto-scan-all`

اسکن کریپتو تولید: ورکر Railway؛ کرون‌های Next اختیاری/دستی‌اند.

### ۴.۴ Process manager و Reverse proxy

| ابزار | در ریپو |
|--------|---------|
| PM2 / systemd unit / forever | **خیر** |
| Nginx / Caddy / Traefik config | **خیر** |
| Cloudflare / DNS IaC | **خیر** |

پروکسی عملیاتی:

1. **Vercel** — TLS، routing، middleware Next، منطقه dub1  
2. **Railway** — TLS به کانتینر/Nixpacks، تزریق `$PORT`  
3. **Supabase** — API gateway + pooler + Realtime  

برای دامنهٔ اختصاصی انجین (`game.*`) باید Custom Domain روی سرویس Railway گذاشته شود؛ در کد پیش‌فرض هنوز `*.up.railway.app` است.

### ۴.۵ نقشهٔ سرویس‌های Railway پیشنهادی (از ARCHITECTURE.md)

```
Railway Project
├── bingo-engine          Root: apps/engines/bingo     Builder: Dockerfile
├── crypto-deposit        Root: /   Start: npm run start -w @dingmoney/crypto-deposit-worker
├── leo-engine            Root: /   Start: npm run start -w @dingmoney/leo-engine-worker
├── business-backup       Root: /   Start: npm run start -w @dingmoney/business-backup-worker
└── performance-snapshot  Root: /   Start: npm run start -w @dingmoney/performance-snapshot-worker
```

وب در تولید امروز روی **Vercel** است نه Railway. انتقال کامل وب به Railway در کد آماده است (همان `npm run build && npm run start` از ریشه) ولی Dockerfile وب وجود ندارد.

### ۴.۶ شکاف‌های DevOps (اولویت ارزیابی)

1. **بدون CI:** تست، typecheck، lint، و اسکن امنیت روی PR اجرا نمی‌شود.  
2. **بدون IaC:** بازسازی محیط به داشبورد Vercel/Railway/Supabase وابسته است.  
3. **اسرار در داشبورد:** چرخش کلید و audit دسترسی خارج از git.  
4. **دو مسیر clock بازی:** اگر `pg_cron` و engine هم‌زمان tick بزنند، double-drive. نیاز به mutex عملیاتی.  
5. **تداخل پورت ورکرها:** چند سرویس پیش‌فرض ۸۰۸۰؛ روی Railway باید `$PORT` یکسان شود (snapshot این را رعایت کرده؛ leo/backup/crypto باید صریحاً `$PORT` بخوانند یا در داشبورد ست شوند).  
6. **بکاپ:** ورکر اختصاصی هست؛ disaster-recovery runbook کامل و تست restore در این اسکن به‌عنوان pipeline خودکار دیده نشد.  
7. **مشاهده‌پذیری:** لاگ با پیشوندهای `[Wallet]`، `[RoomLoop]`، `[Payment]`؛ APM/متریک متمرکز (Prometheus/Datadog) در ریپو نیست. Health ساده است.  
8. **منطقه:** Vercel `dub1`؛ همجواری با منطقهٔ Supabase/Railway باید جداگانه تأیید شود (latency DB).

---

## ۵. مدیریت تنظیمات و اتصالات

### ۵.۱ بارگذاری Env و سکرت‌ها

| محیط | فایل / منبع | لودر |
|------|-------------|------|
| Next لوکال | `.env.local` (در git نیست) | Next.js builtin |
| Bingo لوکال | `apps/engines/bingo/.env` | `dotenv` در `src/index.ts` |
| ورکرها | `.env` کنار پکیج | `import "dotenv/config"` |
| Vercel | Environment Variables داشبورد (Production / Preview / Development) | تزریق بیلد/ران‌تایم |
| Railway | Variables داشبورد per-service | تزریق فرآیند |
| مثال‌ها در ریپو | `apps/engines/bingo/.env.example`، `apps/workers/*/.env.example` | بدون مقدار سکرت |

**Vault در اپ:** استفادهٔ برنامه‌ای از HashiCorp Vault / AWS Secrets Manager نیست. `supabase_vault` در baseline به‌صورت اختیاری ذکر شده.

قواعد:

- کلید مرورگر فقط `NEXT_PUBLIC_*` و anon key  
- `SUPABASE_SERVICE_ROLE_KEY`، `HAMIPAY_API_KEY`، `DATABASE_URL`، xpub کریپتو **فقط سرور**  
- آداپتر HamiPay اگر کلید public باشد پرتاب خطا می‌کند (`hamipay_api_key_must_not_be_public`)

اسکریپت‌های ops: `scripts/sync-game-engine-env.ps1`، `scripts/use-supabase-*.ps1` — کپی/سوییچ env لوکال، نه استقرار.

### ۵.۲ متغیرهای کلیدی (بدون مقدار)

**وب / Vercel**

| متغیر | نقش |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | کلاینت Auth/Realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | API ادمین / RPC ممتاز |
| `DATABASE_URL` | PG pool وب |
| `NEXT_PUBLIC_USE_GAME_ENGINE` | `"true"` → مرورگر `/v1` انجین |
| `NEXT_PUBLIC_GAME_ENGINE_URL` | پایهٔ HTTPS انجین |
| `NEXT_PUBLIC_USE_CARD_POOL_CACHE` | IndexedDB استخر کارت |
| `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE` | `orchestrator` (کد) یا `legacy` (مشاهده در Vercel) |
| `MAIN_APP_HOST` / `ADMIN_APP_HOST` | ریدایرکت middleware |
| `NEXT_PUBLIC_MAIN_HOST` / `_ORIGIN` / `NEXT_PUBLIC_ADMIN_*` / `NEXT_PUBLIC_APP_ORIGIN` | لینک‌ها و درگاه |
| `DEPOSIT_DOMAIN_ENABLED` | گیت شارژ ریالی |
| `HAMIPAY_API_KEY` / `HAMIPAY_API_BASE_URL` / `HAMIPAY_RETURN_BASE_URL` | درگاه |
| `HAMIPAY_MOCK` | فقط غیرتولید |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | Hot Watch مشترک با ورکر کریپتو |
| `CRON_SECRET` | Bearer کرون‌های Next |
| `WATCH_GUEST_COOKIE_SECRET` | مهمان تماشا |
| `ETHERSCAN_API_KEY` / `TRONGRID_API_KEY` | اگر اسکن از Next هم صدا شود |
| `VERCEL_ENV` | تشخیص production برای سقف واریز |

**Bingo Engine / Railway**

| متغیر | نقش |
|--------|------|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Admin SDK |
| `DATABASE_URL` | PG |
| `GAME_ENGINE_API=true` | گوش دادن `/v1` |
| `SCHEDULER_ENABLED=true` | حلقه‌های tick |
| `GAME_RUNTIME=engine` | منطق TS |
| `GAME_ENGINE_HTTP_PORT` | پیش‌فرض ۸۰۸۰ |
| `GAME_ENGINE_CORS_ORIGINS` | allowlist مرورگر |
| `GAME_ENGINE_ROLES` | نقش‌های worker |
| `REDIS_URL` یا `UPSTASH_REDIS_REST_*` | هماهنگی |
| `COORDINATION_STRICT` / `ENGINE_REPLICA_COUNT` / `ENGINE_ID` | چند-replica |
| تنظیمات interval/TTL draw، room-loop، tournament، janitor | `.env.example` انجین |

**Crypto worker:** `DATABASE_URL`، URL/service role سوپابیس، Upstash **همان** وب، `ETHERSCAN_API_KEY`، `TRONGRID_API_KEY`، `CRYPTO_DEPOSIT_HTTP_PORT`.

**Backup worker:** `PROD_DATABASE_URL` (نقش `backup_reader` فقط خواندنی)، `BACKUP_DATABASE_URL`، چهار کلید Storage prod/backup. زمان پیش‌فرض ۰۵:۰۰ تهران.

**Snapshot worker:** `DATABASE_URL` با `EXECUTE` روی `fn_performance_snapshot_run`؛ زمان ۰۸:۰۵ تهران؛ ترجیح `$PORT`.

**Leo worker:** `DATABASE_URL`، `LEO_ENGINE_HTTP_PORT` پیش‌فرض ۸۰۸۱.

### ۵.۳ سرویس‌ها و APIهای ثالث

| سرویس | جهت | کاربرد |
|--------|-----|--------|
| **Supabase** | دو طرفه | Auth، Postgres، Realtime، Storage |
| **Vercel** | میزبانی | Next، TLS، منطقه dub1 |
| **Railway** | میزبانی | Engine Docker + ورکرهای Nixpacks |
| **Upstash Redis** | خروجی | قفل و watch set |
| **HamiPay** (`HAMIPAY_API_BASE_URL`، در مستندات `hamipay.hppaya.com`) | خروجی HTTPS | `POST /payments`، `GET /payments/{id}` — هدر `X-Api-Key`، `Idempotency-Key` |
| **شاپرک** | از طریق HamiPay | پرداخت ریالی کاربر |
| **Etherscan API v2** | خروجی | `https://api.etherscan.io/v2/api` chainid=56 (BSC USDT/BNB) |
| **TronGrid** | خروجی | `https://api.trongrid.io` (TRX / USDT TRC-20) |
| **WhatsApp** | لینک کلاینت | پشتیبانی (`wa.me`) — فعلاً در UI مخفی |

HD مشتق آدرس کریپتو: `@noble/curves`، `@scure/bip32`، `bs58` — xpub در تنظیمات ادمین/env، نه در فرانت.

Edge Functions سوپابیس برای runtime زندهٔ بازی **استفاده نمی‌شوند** (stubs تاریخی؛ dev-player روی engine است).

---

## پیوست الف — درخت اجرایی فعلی (خلاصه)

```
winway-dev/
├── app/                    Next App Router + API BFF
├── components/ lib/ services/ src/ middleware.ts
├── public/                 PWA, sw.js, manifests
├── apps/engines/bingo/     سرویس Docker بازی
├── apps/engines/backgammon/  کتابخانه قوانین (وارد Next)
├── apps/engines/tic-tac-toe/ کتابخانه قوانین (وارد Next)
├── apps/workers/*          چهار ورکر Railway
├── apps/web/               PLACEHOLDER
├── packages/*              قراردادها + deposit-core + leo-core
├── sql/baseline|migrations منبع اسکیما
├── supabase/config.toml    CLI (project_id در فایل لوکال)
├── infrastructure/         PLACEHOLDER
├── tools/                  تست‌های ops (shadow, finance, hamipay, …)
└── vercel.json             regions: dub1
```

## پیوست ب — جریان دادهٔ یک قرعهٔ زنده (بینگو)

```
room-loop actor (RAM clock)
  → insert draw (PG, provably-fair sha256(room_seed))
  → mark/evaluate in-memory
  → finalize RPC (results, ding, maybe settle)
  → Realtime / snapshot API به کلاینت
  → wallets فقط از SQL

Fallback: draw_jobs queue + draw-processor + Redis room lock
```

## پیوست ج — چک‌لیست استقرار سه‌دامنه‌ای (هدف عملیاتی)

| دامنه | سرویس | نکته |
|--------|--------|------|
| `game.*` | Railway `bingo-engine` | Dockerfile، `/health`، CORS به origin وب |
| `admin.*` | همان Next (Vercel یا Railway) | `ADMIN_APP_HOST` |
| `pay.*` | همان Next (دامنهٔ دوم) | `HAMIPAY_RETURN_BASE_URL` + مسیر `/payment/callback` — ورکر کریپتو را به `pay.*` وصل نکنید |

همهٔ مسیرهای مالی باید **یک** `DATABASE_URL` (همان پروژهٔ Postgres) را ببینند. موجودی را در Redis نگذارید.

---

*این سند برای ارزیابی DevOps تهیه شده و جایگزین runbookهای جزئی (`docs/runbooks/`، `ARCHITECTURE.md`) نیست؛ آن‌ها را برای رویه‌های mutex کرون، replica و شارژ تکمیل می‌کند.*
