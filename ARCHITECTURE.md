# معماری فعلی پلتفرم Ding (Winway)

**تاریخ:** ۳ سپتامبر ۲۰۲۶  
**وضعیت:** سند عملیاتی بر اساس کد واقعی ریپو (نه طرح آینده)  
**ریپوزیتوری:** یک Git repo واحد — مونوریپو با چند پکیج npm و چند سرویس قابل استقرار جداگانه

این سند چهار چیز را شفاف می‌کند: سرویس‌ها و اتصال به دیتابیس، نحوه اجرا، تقسیم‌بندی Railway برای سه ساب‌دامین، و جریان کامل خرید سکه (شارژ ریالی).

---

## ۱. مدل ریپوزیتوری: Monorepo با چند سرویس

پروژه **یک ریپوزیتوری** است (نه چند repo جدا). داخل آن چند **فرآیند اجرایی** وجود دارد که هرکدام `package.json` خود را دارند.

| لایه | مسیر | `package.json` جدا؟ | Dockerfile جدا؟ | نقش |
|------|------|---------------------|-----------------|-----|
| اپ وب Next.js (بازیکن + ادمین + API پرداخت ریالی) | ریشهٔ ریپو (`app/`, `lib/`, `components/`) | بله — `package.json` ریشه | خیر | UI بازیکن، پنل ادمین، APIهای پلتفرم |
| گیم‌انجین بینگو | `apps/engines/bingo` | بله — خارج از workspaces ریشه | بله — `apps/engines/bingo/Dockerfile` | حلقهٔ بازی، قرعه، روم، تورنومنت |
| ورکر واریز کریپتو | `apps/workers/crypto-deposit` | بله — workspace | خیر (Nixpacks) | اسکن زنجیره و شارژ کیف پول کریپتو |
| ورکر Leo | `apps/workers/leo-engine` | بله — workspace | خیر | رفتار بازیکن‌های توسعه‌ای Leo |
| ورکر بکاپ کسب‌وکار | `apps/workers/business-backup` | بله — workspace | خیر | آرشیو روزانه به `winway_backup` |
| ورکر اسنپ‌شات عملکرد | `apps/workers/performance-snapshot` | بله — workspace | خیر | آمار روزانه حسابداری |
| موتور تخته نرد (کتابخانه) | `apps/engines/backgammon` | بله — workspace | خیر | قوانین خالص؛ سرویس HTTP جدا نیست |
| موتور دوز (کتابخانه) | `apps/engines/tic-tac-toe` | بله — workspace | خیر | قوانین خالص؛ سرویس HTTP جدا نیست |

Workspaces ریشه (`package.json`):

```
packages/*
apps/workers/*
apps/engines/backgammon
apps/engines/tic-tac-toe
```

**گیم‌انجین بینگو در workspaces ریشه نیست.** `apps/engines/bingo` قفل وابستگی و نصب جداگانه دارد (`package-lock.json` خودش). Next.js هم هنوز به `apps/web` منتقل نشده؛ `apps/web/` فقط placeholder است.

نتیجه: **Monorepo + Multi-Service**. کد همه در یک repo است؛ استقرار می‌تواند چند سرویس Railway با Root Directory متفاوت باشد.

---

## ۲. سرویس‌ها و ماژول‌ها

### ۲.۱ اپ وب Next.js — بازیکن + ادمین + درگاه ریالی

| مورد | مقدار |
|------|--------|
| محل کد | ریشه: `app/`, `components/`, `lib/`, `services/`, `middleware.ts` |
| فریم‌ورک | Next.js 14 (App Router) |
| استقرار فعلی (تولید) | Vercel — دامنهٔ بازیکن `dingmoney.org` و دامنهٔ ادمین `admin.dingmoney.org` از **یک بیلد** |
| جداسازی ادمین | فقط با **هاست**، نه با ریپو یا پکیج جدا |

`middleware.ts` روی هاست اصلی، مسیرهای `/admin` و `/dev-panel` را به `ADMIN_APP_HOST` ریدایرکت می‌کند (پیش‌فرض `admin.dingmoney.org`). پنل ادمین همان اپ Next است با مسیرهای `app/admin/**` و APIهای `app/api/admin/**`.

سطوح داخل همین فرآیند:

- UI بازیکن (`app/player/**`, `src/screens/**`)
- پنل ادمین (`app/admin/**`)
- پنل ایجنت / سوپر
- API پرداخت ریالی HamiPay (`app/api/player/deposit/**`, `app/payment/callback`)
- کراون‌های اختیاری (`app/api/cron/deposit-reconcile`, اسکن کریپتو دستی)

### ۲.۲ گیم‌انجین بینگو (سرور اصلی بازی دبرنا / Bingo)

| مورد | مقدار |
|------|--------|
| هویت سرویس | `bingo-engine` (فیلد `service` در `/health`) |
| مسیر | `apps/engines/bingo` |
| ورودی | `src/index.ts` |
| پورت پیش‌فرض | `GAME_ENGINE_HTTP_PORT` = `8080` |
| نقش | orchestration بازی: waiting→playing، صف `draw_jobs`، room-loop، تورنومنت، dev-player |

API وقتی `GAME_ENGINE_API=true` باشد روی همان پورت بالا می‌آید:

- `GET /health` — liveness
- `GET /ready` — readiness (هماهنگی Redis)
- `GET /v1/lobby` ، `GET /v1/gameroom` ، `GET /v1/live-room`
- `POST /v1/rooms/join`

اپ وب با `NEXT_PUBLIC_GAME_ENGINE_URL` و فلگ `NEXT_PUBLIC_USE_GAME_ENGINE` به انجین وصل می‌شود. **ایمپورت مستقیم TypeScript از Next به انجین وجود ندارد** (`tsconfig.json` مسیر `apps/engines/bingo` را exclude می‌کند). ارتباط فقط HTTP است.

کیف پول و تسویه در انجین **مستقیم UPDATE نمی‌شود**. انجین RPCهای PostgreSQL را صدا می‌زند (`game_finance.fn_wallet_apply_delta` و توابع settle). منبع حقیقت مالی دیتابیس است، نه حافظهٔ انجین.

### ۲.۳ ماژول پرداخت

دو مسیر کاملاً جدا وجود دارد. نام درگاه ریالی در کد **HamiPay** است (`hamipay.hppaya.com`) — رشتهٔ «Hami Pro» در ریپو نیست؛ اگر منظور همان درگاه است، همین ماژول است.

#### الف) شارژ ریالی (HamiPay / درگاه شاپرک)

| مورد | مقدار |
|------|--------|
| محل کد | `lib/deposit/*` داخل اپ Next.js |
| ورکر Railway جدا | **وجود ندارد** |
| Callback سرور به سرور (webhook) | **وجود ندارد** |
| مدل | ساخت intent → ریدایرکت مرورگر به درگاه → بازگشت به `/payment/callback` → **poll وضعیت از API درگاه** → اعتبارسنجی SQL → شارژ کیف پول |
| پشتیبان | کراون `POST /api/cron/deposit-reconcile` برای intentهای گیرکرده |

مسیرهای کلیدی:

- `POST /api/player/deposit/create` — ساخت فاکتور و URL درگاه
- صفحهٔ `app/payment/callback/page.tsx` — بازگشت بازیکن
- `POST /api/player/deposit/verify` — استعلام HamiPay و شارژ
- `POST /api/cron/deposit-reconcile` — آشتی دوره‌ای

آداپتر (`lib/deposit/hamipayAdapter.ts`) فقط evidence می‌سازد و **هرگز کیف پول را عوض نمی‌کند**. شارژ فقط از طریق `deposit.fn_post_credit` → `fn_wallet_apply_delta` انجام می‌شود.

#### ب) واریز کریپتو (USDT/TRX و مشابه)

| مورد | مقدار |
|------|--------|
| هستهٔ مشترک | پکیج `@dingmoney/deposit-core` |
| ورکر | `apps/workers/crypto-deposit` (`@dingmoney/crypto-deposit-worker`) |
| اطلاع‌رسانی UI | `cryptoNotify.ts` — broadcast سوپابیس Realtime |

این ورکر **جایگزین Callback ریالی HamiPay نیست.**

### ۲.۴ اتصال به دیتابیس و کش

```
                    ┌─────────────────────┐
                    │  PostgreSQL (SoT)   │  ← کیف پول، روم، کارت، واریز، لجر
                    │  روی پروژه Supabase │
                    └──────────┬──────────┘
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
     Next.js (pg +          bingo-engine         workers
     Supabase SDK)          (pg + service        (pg مستقیم)
                            role SDK)
           │                   │
           ▼                   ▼
     Supabase Auth        Upstash Redis
     Realtime / Storage   (قفل leader، هماهنگی replica،
                          Hot Watch کریپتو)
```

| منبع | چه کسی استفاده می‌کند | برای چه |
|------|------------------------|---------|
| **PostgreSQL** (`DATABASE_URL`، ترجیحاً transaction pooler پورت `6543`) | Next APIها (`lib/pg.ts`)، انجین، ورکرها | منبع حقیقت: `wallets`, `transactions`, `rooms`, `deposit.intents`, تورنومنت، کارت |
| **Supabase Auth** | مرورگر + APIهای Next + JWT انجین | ورود، نشست، Bearer برای `/v1/*` |
| **Supabase Realtime** | UI بازیکن (`useBalances` روی جدول `wallets`) | تازگی موجودی بعد از شارژ — **نه منبع حقیقت مالی** |
| **Supabase Storage** | ادمین / پروفایل | بنر، آواتار |
| **Supabase service_role** | انجین، برخی APIهای ادمین | RPCهای مالی و orchestration |
| **Upstash Redis** | انجین (قفل leader / coordination)، ورکر کریپتو + Next (Hot Watch) | هماهنگی، نه موجودی کیف پول |
| **HamiPay HTTP API** | فقط سرور Next (`HAMIPAY_API_KEY`) | ساخت پرداخت و استعلام وضعیت |

قانون معماری پروژه: تصمیم مالی و نتیجهٔ بازی از Realtime گرفته نمی‌شود. Snapshot PostgreSQL اصلاح می‌کند.

---

## ۳. دستورات اجرای محلی

پیش‌نیاز همه: `npm install` از **ریشهٔ ریپو**. فایل env: `.env.local` برای Next، `apps/engines/bingo/.env` برای انجین.

### ۳.۱ اپ وب (بازیکن + ادمین + پرداخت ریالی)

از ریشه:

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
npm run start
```

پنل ادمین در dev معمولاً همان `http://localhost:3000/admin/...` است. جداسازی دامنه فقط وقتی `MAIN_APP_HOST` / `ADMIN_APP_HOST` تنظیم شده باشد معنا دارد.

تست درگاه (mock):

```bash
npm run test:hamipay-deposit
```

### ۳.۲ گیم‌انجین بینگو

```bash
cd apps/engines/bingo
npm install
npm run dev          # tsx watch → معمولاً http://localhost:8080
npm run build
npm run start        # node dist/index.js
```

برای لوکال بدون تداخل با Railway: `SCHEDULER_ENABLED` را false بگذارید (پیش‌فرض). روی سرور واقعی: `SCHEDULER_ENABLED=true` و `GAME_ENGINE_API=true`.

سلامت:

```bash
curl http://localhost:8080/health
```

### ۳.۳ ورکر پرداخت کریپتو (نه HamiPay)

از ریشه (workspace):

```bash
npm run start -w @dingmoney/crypto-deposit-worker
```

یا:

```bash
cd apps/workers/crypto-deposit
npm run dev          # http://localhost:8080/health
```

### ۳.۴ سایر ورکرها

```bash
npm run start -w @dingmoney/leo-engine-worker
npm run start -w @dingmoney/business-backup-worker
npm run start -w @dingmoney/performance-snapshot-worker
```

**ورکر جدا با نام «Payment Worker» برای Callback ریالی HamiPay در ریپو وجود ندارد.** آن منطق داخل `npm run dev` / `npm run start` همان اپ Next است.

---

## ۴. نقشهٔ راه‌اندازی Railway برای سه ساب‌دامین

### ۴.۱ واقعیت امروز (قبل از جابه‌جایی کامل به Railway)

| قطعه | پلتفرم فعلی | دامنهٔ نمونه |
|------|-------------|--------------|
| Next.js (بازیکن + ادمین + HamiPay) | Vercel | `dingmoney.org` و `admin.dingmoney.org` |
| گیم‌انجین | Railway (Docker) | `*.up.railway.app` |
| ورکر کریپتو / Leo / بکاپ / اسنپ‌شات | Railway (Nixpacks) | داخلی / health |

فایل `railway.toml` در ریپو نیست؛ تنظیمات در داشبورد Railway است.

### ۴.۲ سه سرویسی که برای دامنه‌های درخواستی لازم است

درخواست:

| دامنه | انتظار |
|-------|--------|
| `game.yourdomain.com` | گیم‌انجین |
| `admin.yourdomain.com` | پنل ادمین |
| `pay.yourdomain.com` | Callback درگاه (HamiPay) |

**محدودیت مهم:** پنل ادمین و Callback ریالی هر دو هنوز داخل **یک کدبیس Next.js** هستند. ورکر اختصاصی فیات برای `pay.*` نوشته نشده. بنابراین روی Railway یا همان اپ Next را با چند دامنه سرو می‌کنید، یا دو سرویس Railway با **Root Directory یکسان** (`/`) و env متفاوت می‌سازید.

#### سرویس A — Game Engine → `game.yourdomain.com`

| تنظیم Railway | مقدار |
|---------------|--------|
| نام پیشنهادی | `bingo-engine` |
| Root Directory | `apps/engines/bingo` |
| Builder | **Dockerfile** (نه Nixpacks) |
| Dockerfile | `Dockerfile` (نسبی به Root Directory) |
| Start Command | خالی بگذارید — `CMD ["node", "dist/index.js"]` |
| پورت | `8080` یا `GAME_ENGINE_HTTP_PORT=$PORT` |
| Healthcheck | `GET /health` |
| Custom Domain | `game.yourdomain.com` |

Env ضروری (نمونه):

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
GAME_ENGINE_API=true
SCHEDULER_ENABLED=true
GAME_RUNTIME=engine
GAME_ENGINE_HTTP_PORT=8080
GAME_ENGINE_ROLES=scheduler,draw-processor,room-loop,tournament-orchestrator,dev-player-scheduler,dev-player-processor
GAME_ENGINE_CORS_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com
REDIS_URL=   # یا UPSTASH_REDIS_REST_URL + TOKEN برای چند replica
```

اپ وب باید `NEXT_PUBLIC_GAME_ENGINE_URL=https://game.yourdomain.com` داشته باشد.

#### سرویس B — Admin Panel → `admin.yourdomain.com`

| تنظیم Railway | مقدار |
|---------------|--------|
| نام پیشنهادی | `web-admin` (همان اپ Next) |
| Root Directory | **خالی / ریشهٔ ریپو** (`/`) |
| Builder | Nixpacks (Node) |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run start` |
| پورت | Railway `PORT` (Next آن را می‌خواند) |
| Custom Domain | `admin.yourdomain.com` |

Env مرتبط با دامنه:

```
MAIN_APP_HOST=yourdomain.com
ADMIN_APP_HOST=admin.yourdomain.com
NEXT_PUBLIC_ADMIN_ORIGIN=https://admin.yourdomain.com
NEXT_PUBLIC_MAIN_ORIGIN=https://yourdomain.com
NEXT_PUBLIC_GAME_ENGINE_URL=https://game.yourdomain.com
NEXT_PUBLIC_USE_GAME_ENGINE=true
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

این سرویس کل Next را بیلد می‌کند (بازیکن + ادمین + API پرداخت). جدا کردن «فقط ادمین» بدون استخراج کد ممکن نیست.

اگر بازیکن روی Vercel بماند و فقط ادمین به Railway بیاید، همان Start/Root بالا کافی است؛ فقط دامنه‌ها و `MAIN_APP_HOST` را با واقعیت هماهنگ کنید.

#### سرویس C — Payment / Callback → `pay.yourdomain.com`

دو راه عملی با کد **فعلی**:

**راه پیشنهادی (کم‌هزینه):** دامنهٔ `pay.yourdomain.com` را روی **همان سرویس Next** (سرویس B) به‌عنوان Custom Domain دوم بگذارید. ورکر جدا نسازید.

```
HAMIPAY_RETURN_BASE_URL=https://pay.yourdomain.com
```

درگاه باید `https://pay.yourdomain.com/payment/callback` را در allowlist داشته باشد. مسیر بازگشت در کد همیشه `{base}/payment/callback` است (بدون query).

**راه ایزوله (دو فرآیند Next):** سرویس Railway سوم با همان Root `/` و همان `npm run start`، فقط برای پرداخت:

| تنظیم Railway | مقدار |
|---------------|--------|
| نام پیشنهادی | `web-pay` |
| Root Directory | `/` |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run start` |
| Custom Domain | `pay.yourdomain.com` |
| Env | `HAMIPAY_*`, `DEPOSIT_DOMAIN_ENABLED=true`, `DATABASE_URL`, همان Supabase |

این فرآیند **ورکر صف نیست**؛ یک نمونهٔ دیگر از Next است که صفحهٔ callback و `POST /api/player/deposit/verify` را سرو می‌کند. تا وقتی webhook سرور به سرور در کد اضافه نشود، درگاه باید مرورگر را به همین دامنه برگرداند.

ورکر `@dingmoney/crypto-deposit-worker` را به `pay.*` وصل نکنید؛ آن اسکنر بلاکچین است.

### ۴.۳ جمع‌بندی تقسیم Railway (حداقل پیشنهادی)

```
Railway Project
├── bingo-engine          Root: apps/engines/bingo     Domain: game.*
├── web-next              Root: /                      Domain: admin.*  (+ اختیاری pay.*)
├── crypto-deposit        Root: /   Start: npm run start -w @dingmoney/crypto-deposit-worker
├── leo-engine            Root: /   Start: npm run start -w @dingmoney/leo-engine-worker
├── business-backup       Root: /   Start: npm run start -w @dingmoney/business-backup-worker
└── performance-snapshot  Root: /   Start: npm run start -w @dingmoney/performance-snapshot-worker
```

برای **سه ساب‌دامین درخواستی** فقط دو (یا حداکثر سه) سرویس اول لازم است. بقیه از قبل در معماری تولید هستند و به این سه دامنه مربوط نیستند.

---

## ۵. جریان تراکنش مالی — خرید سکه (شارژ ریالی HamiPay)

واحدها: UI خرید با **ریال** کار می‌کند؛ کیف پول PostgreSQL با **تومان** (۱ تومان = ۱۰ ریال)؛ HamiPay/شاپرک دوباره **ریال** می‌گیرد.

منبع حقیقت شارژ: PostgreSQL (`deposit.*` + `wallets` + `transactions`).  
گیم‌انجین در این مسیر **صدا زده نمی‌شود** و نباید بشود. بعد از شارژ، موجودی در DB است؛ انجین هنگام join همان موجودی را از DB/RPC می‌خواند. UI با Realtime روی `wallets` و صفحهٔ callback به‌روز می‌شود.

### مسیر موفق (خط به خط)

1. بازیکن در `/player/wallet/buy-rial` مبلغ را به ریال وارد می‌کند (و در حالت دستی، نام و موبایل را برای اولین واریز).
2. مرورگر `POST /api/player/deposit/create` را با JWT سوپابیس می‌زند. `user_id` از کلاینت پذیرفته نمی‌شود.
3. گیت `DEPOSIT_DOMAIN_ENABLED` / کلید HamiPay بررسی می‌شود؛ در غیر این صورت `503`.
4. Rate limit per-user (۸ درخواست در ۶۰ ثانیه).
5. منوی پرداخت بازیکن (`buy_rial`) از PostgreSQL چک می‌شود.
6. مبلغ به تومان صحیح می‌شود و با `DEPOSIT_MIN/MAX_AMOUNT_TOMAN` اعتبارسنجی می‌گردد.
7. هویت مشتری از `users` + `user_profiles` (قفل first-write) یا هویت مصنوعی پایدار حل می‌شود.
8. `deposit.fn_create_intent(...)` یک ردیف در `deposit.intents` می‌سازد: `provider=hamipay`, `channel=fiat_gateway`, مبلغ مورد انتظار به تومان، انقضا حدود ۶۰ دقیقه. کیف پول هنوز دست نخورده است.
9. `merchant_order_id` برابر `depositId` ذخیره می‌شود.
10. سرور به HamiPay `POST /payments` می‌زند (هدر `X-Api-Key` و `Idempotency-Key=depositId`). بدن: مبلغ ریال، `returnUrl = HAMIPAY_RETURN_BASE_URL + /payment/callback`.
11. `provider_intent_ref` و `payment_url` روی intent نوشته می‌شود؛ `deposit.fn_activate_intent` وضعیت را `pending` می‌کند.
12. API به مرورگر `{ depositId, paymentUrl }` برمی‌گرداند. هنوز هیچ دلتا روی wallet نیست.
13. مرورگر به صفحهٔ پرداخت HamiPay می‌رود؛ بازیکن در شاپرک پرداخت می‌کند.
14. درگاه مرورگر را به `{HAMIPAY_RETURN_BASE_URL}/payment/callback` برمی‌گرداند (بدون query در قرارداد فعلی).
15. صفحهٔ Next (`app/payment/callback`) نشست سوپابیس را می‌گیرد و `POST /api/player/deposit/verify` را می‌زند:
    - اگر `depositId` در URL باشد همان استفاده می‌شود؛
    - وگرنه `merchantOrderId`؛
    - وگرنه آخرین intent غیرنهایی همان کاربر (`resolveLatest`).
16. Verify مالکیت intent را با JWT چک می‌کند (کرون می‌تواند `skipOwnershipCheck` باشد).
17. اگر وضعیت از قبل `credited` باشد، همان نتیجه برمی‌گردد — **بدون شارژ دوم** (idempotent).
18. سرور وضعیت را از HamiPay `GET /payments/{paymentId}` می‌پرسد. مبلغ/وضعیت مرورگر اعتماد نمی‌شود.
19. تطبیق اجباری: `providerPaymentId`، `merchantOrderId`، مبلغ مشاهده‌شده ≡ `amount_expected`، محیط `development|production`.
20. اگر درگاه هنوز `pending` باشد، UI «در انتظار تأیید» نشان می‌دهد؛ wallet عوض نمی‌شود.
21. اگر `failed` / `cancelled` یا عدم تطابق مبلغ: `fn_record_attempt` + `fn_fail_verification` → intent رد می‌شود؛ شارژ نمی‌شود.
22. اگر `paid` و همهٔ بندها درست:
    1. `deposit.fn_record_attempt` — مشاهدهٔ خام
    2. `deposit.fn_begin_verification` — ورود به منطقهٔ verify
    3. `deposit.fn_pass_verification` — تأیید قراردادی (مبلغ، شناسهٔ خارجی یکتا، …)
    4. `deposit.fn_post_credit` در یک تراکنش DB → داخل آن `fn_wallet_apply_delta` با کلید idempotency واریز
23. نتیجه: `wallets.balance` افزایش، ردیف لجر در `transactions`، intent = `credited`.
24. **اطلاع به گیم‌انجین:** هیچ HTTP به `game.*` زده نمی‌شود. انجین موجودی را از PostgreSQL در join/settle می‌خواند؛ نیازی به پیام جدا نیست.
25. **اطلاع به UI:** صفحهٔ callback پیام موفقیت می‌دهد؛ `useBalances` با `postgres_changes` روی `public.wallets` موجودی تومان را زنده می‌کند. بازیکن می‌تواند فوراً وارد روم شود چون hold از همان موجودی DB کم می‌شود.

### مسیرهای کمکی

- **Resume:** همان `POST /create` با `depositId` موجود، `paymentUrl` قبلی را برمی‌گرداند؛ پرداخت دوم در درگاه ساخته نمی‌شود.
- **Replay verify:** intent `credited` → پاسخ موفق با `replayed: true`.
- **کرون آشتی:** `POST /api/cron/deposit-reconcile` با `Bearer CRON_SECRET` همان `verifyAndCredit` را برای intentهای `pending|observed|verifying|confirmed` تکرار می‌کند (اگر بازیکن صفحهٔ بازگشت را نبندد/نبیند).
- **شکست ساخت درگاه:** `deposit.fn_mark_create_failed`؛ wallet دست نخورده.

### آنچه عمداً در این جریان نیست

- وب‌هوک امضاشده از HamiPay به سرور (فعلاً poll + return URL + cron)
- ورکر Railway مخصوص فیات
- فراخوانی گیم‌انجین برای «اعلام شارژ»
- اعتماد به مبلغ یا وضعیت در query استرینگ مرورگر

---

## ۶. چک‌لیست استقرار سه‌دامنه‌ای

1. سرویس Docker انجین با Root `apps/engines/bingo` و دامنهٔ `game.*`.
2. سرویس Next با Root `/`، `npm run start`، دامنهٔ `admin.*`.
3. `pay.*` را یا روی همان سرویس Next به‌عنوان دامنهٔ دوم بگذارید، یا یک سرویس Next تکراری فقط برای callback.
4. در پنل HamiPay، Return URL را `https://pay.yourdomain.com/payment/callback` ثبت کنید و `HAMIPAY_RETURN_BASE_URL` را همان origin بگذارید.
5. `NEXT_PUBLIC_GAME_ENGINE_URL=https://game.yourdomain.com` روی سرویس وب.
6. همهٔ سرویس‌های مالی همان `DATABASE_URL` (PostgreSQL Supabase) را داشته باشند.
7. Redis را بین replicaهای انجین (و در صورت استفاده، ورکر کریپتو و Next) یکسان کنید؛ موجودی را در Redis ذخیره نکنید.

---

## ۷. ارجاع سریع به کد

| موضوع | مسیر |
|-------|------|
| ساخت پرداخت ریالی | `app/api/player/deposit/create/route.ts` |
| تأیید و شارژ | `lib/deposit/hamipayFlow.ts` ، `app/api/player/deposit/verify/route.ts` |
| آداپتر درگاه | `lib/deposit/hamipayAdapter.ts` |
| بازگشت مرورگر | `app/payment/callback/page.tsx` |
| شارژ SQL | `deposit.fn_post_credit` → `fn_wallet_apply_delta` |
| روتینگ ادمین | `middleware.ts` ، `app/admin/**` |
| انجین | `apps/engines/bingo/src/index.ts` |
| ورکر کریپتو | `apps/workers/crypto-deposit` |
| اتصال PG وب | `lib/pg.ts` |
)
