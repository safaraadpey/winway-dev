# Game Engine Migration — برنامهٔ کامل تغییرات

> **Branch:** `develop`  
> **هدف cutover:** ۵۰۰+ پلیر هم‌زمان (CCU)، ۵۰–۱۰۰ روم فعال، ۳۰–۶۰ روم `playing` در peak  
> **استراتژی:** Postgres = بانک + هویت + RPCهای مالی اتمیک؛ **Game Engine** = orchestration بازی  
> **Runtime flag:** `GAME_RUNTIME=legacy_db | hybrid | engine`

---

## فهرست

1. [معماری هدف](#1-معماری-هدف)
2. [ساختار پروژه](#2-ساختار-پروژه)
3. [چه چیز در DB می‌ماند](#3-چه-چیز-در-db-می‌ماند)
4. [اولویت‌بندی کلی (P0–P4)](#4-اولویت‌بندی-کلی-p0p4)
5. [دسته‌بندی تغییرات](#5-دسته‌بندی-تغییرات)
6. [Inventory توابع DB](#6-inventory-توابع-db)
7. [فازبندی اجرا](#7-فازبندی-اجرا)
8. [Cutover و Rollback](#8-cutover-و-rollback)
9. [معیارهای Done](#9-معیارهای-done)
10. [ریسک‌ها](#10-ریسک‌ها)

---

## 1. معماری هدف

```
┌─────────────┐     HTTP/JWT      ┌──────────────┐
│  Next.js    │ ───────────────►  │ Game Engine  │
│  (UI/API)   │                   │  (Node TS)   │
└──────┬──────┘                   └──────┬───────┘
       │                                 │
       │ Realtime                        │ service_role + RPC مالی
       ▼                                 ▼
┌──────────────────────────────────────────────────┐
│              Supabase Postgres                    │
│  DATA: rooms, tickets, draws, marks, results     │
│  LEDGER: wallets, transactions, commissions      │
│  IDENTITY: users, affiliation, tournament_entries│
└──────────────────────────────────────────────────┘
       ▲
       │ optional cache / locks
┌──────┴──────┐
│ Upstash Redis│  leader lock, lobby cache, draw dedupe
└─────────────┘
```

### Upstash Redis (فعال)

| کاربرد | فاز | کلید نمونه |
|--------|-----|------------|
| **Leader lock** — یک replica scheduler/draw/tournament | P1 | `ding:game-engine:lock:scheduler` |
| **Lobby snapshot cache** (TTL 2–5s) | P1 | `ding:game-engine:cache:lobby-snapshot` |
| **Draw inflight dedupe** | P1+ | `ding:game-engine:draw:inflight:{roomId}:{n}` |
| **Rate limit join** (اختیاری) | P2 | per-user key |

**اتصال game-engine:** `REDIS_URL=rediss://...` (Redis protocol از داشبورد Upstash)  
**Next.js (بعداً):** می‌توان `UPSTASH_REDIS_REST_URL` + token برای cache لابی در API route استفاده کرد.

فعلاً (`legacy_db`): Redis **اختیاری** — بدون `REDIS_URL` engine تک‌instance کار می‌کند.


| Mode | توضیح |
|------|--------|
| `legacy_db` | وضع فعلی: `pg_cron` + `fn_heartbeat_tick` + draw worker در DB/Edge |
| `hybrid` | draw-processor در engine؛ scheduler هنوز DB |
| `engine` | همهٔ loopهای بازی در engine؛ DB فقط داده + مالی |

---

## 2. ساختار پروژه

```
winway/
├── apps/engines/bingo/            ← سرویس orchestration (Node 20 + TypeScript; P4.2 path)
│   ├── src/
│   │   ├── config/              env, GAME_RUNTIME, roles
│   │   ├── db/                  Supabase admin client
│   │   ├── redis/               Upstash client, locks, key prefixes
│   │   ├── workers/
│   │   │   ├── draw-processor/  consume draw_jobs
│   │   │   ├── room-scheduler/  waiting→playing, insert draws
│   │   │   └── tournament-orchestrator/
│   │   ├── domain/              room, draw, tournament logic
│   │   ├── commands/            join, settle, seat
│   │   ├── finance/             thin RPC wrappers (no direct wallet UPDATE)
│   │   ├── health/              /health
│   │   └── metrics/
│   ├── Dockerfile
│   └── .env.example
├── packages/
│   └── game-contracts/          types مشترک (اختیاری، فاز ۴)
├── sql/
│   └── migrations/              migrationهای cutover + امنیت
├── docs/
│   └── roadmap/
│       └── GAME_ENGINE_MIGRATION.md   ← این سند
└── app/ + services/ + lib/     Next.js (تغییرات API/فرانت)
```

---

## 3. چه چیز در DB می‌ماند

### می‌ماند (Ledger / Identity)

| حوزه | جداول / توابع |
|------|----------------|
| کاربر | `users`, `user_profiles`, `player_affiliation` |
| کیف پول | `wallets`, `transactions` |
| مالی | `game_finance.fn_wallet_*`, commission record/distribute |
| تورنومنت مالی | `tournament_entries`, locks, commission snapshots |
| Audit | `admin_audit_log` |
| **دادهٔ بازی** | `rooms`, `tickets`, `draws`, `marks`, `results` (engine می‌نویسد) |

### خارج می‌شود (Game Engine)

| حوزه | منبع فعلی DB |
|------|----------------|
| Draw scheduling | `game_core.fn_manage_room_live_actions` |
| Draw processing | `fn_process_draw_jobs_batch*`, Edge `draw-worker` |
| Waiting→live | `game_core.fn_manage_waiting_rooms` (بخش orchestration) |
| Tournament tick | `tournament.fn_tick_due_tournaments` |
| System seating | `fn_seat_table_players` + JWT impersonation |
| Join orchestration (هدف) | فراخوانی مستقیم `fn_join_or_create_room` از client |

---

## 4. اولویت‌بندی کلی (P0–P4)

| اولویت | معنی | زمان تقریبی |
|--------|------|-------------|
| **P0** | امنیت + baseline + draw worker بیرون (hybrid) | هفته ۱–۲ |
| **P1** | room scheduler + lobby aggregate + scale 300 CCU | هفته ۲–۳ |
| **P2** | join از API + tournament seating امن + engine tournament tick | هفته ۳–۵ |
| **P3** | migrate evaluate/mark به TS + REVOKE game_core از client | هفته ۵–۷ |
| **P4** | cutover کامل `GAME_RUNTIME=engine` + soak test | هفته ۷–۸ |

---

## 5. دسته‌بندی تغییرات

### A) امنیت — **P0 (فوری، قبل از scale)**

| # | تغییر | فایل/محل | توضیح |
|---|--------|----------|--------|
| A1 | `REVOKE EXECUTE` روی `public.fn_tournament_entry_upsert` از `anon`, `authenticated` | migration SQL | تابع `p_user_id` می‌گیرد بدون `auth.uid()` — **ریسک جعل entry** |
| A2 | `REVOKE EXECUTE` روی `public.fn_system_join_or_create_room` از client | migration SQL | فقط `service_role` / engine |
| A3 | حذف/deprecate `fn_seat_players_for_round` (JWT impersonation) | migration + engine | جایگزین: `SeatPlayer` command با check assignment |
| A4 | `REVOKE EXECUTE` روی `game_core.fn_*` حساس از `authenticated` | migration SQL | `fn_manage_room_live_actions`, `fn_payout_room`, `rpc_pick_draw_jobs`, ... |
| A5 | seating فقط با verify `tournament_round_assignments` + entry `created` | engine `domain/tournament` | جلوگیری از seat arbitrary user |
| A6 | audit log برای system join/seat | engine + DB | `target_table=tickets`, meta: tournament_id, actor=engine |

---

### B) Game Engine — **P0 → P3**

| # | تغییر | اولویت | مسیر |
|---|--------|--------|------|
| B1 | اسکلت سرویس + Docker + health | ✅ انجام شد | `apps/engines/bingo/` |
| B2 | draw-processor: pick jobs → marks → evaluate → done | **P0** | `workers/draw-processor` |
| B3 | غیرفعال `pg_cron` draw worker هنگام `GAME_RUNTIME≠legacy_db` | **P0** | migration + deploy doc |
| B4 | room-scheduler: waiting→playing + insert draw + backpressure | **P1** | `workers/room-scheduler` |
| B5 | غیرفعال `fn_heartbeat_tick` draw بخش | **P1** | migration |
| B6 | tournament-orchestrator: جایگزین `fn_tick_due_tournaments` | **P2** | `workers/tournament-orchestrator` |
| B7 | `commands/joinOrCreateRoom` — orchestration + RPC مالی | **P2** | `commands/` |
| B8 | `commands/seatTournamentTable` — بدون impersonation | **P2** | `domain/tournament` |
| B9 | migrate `applyMarks` + `evaluateWin` به TS | **P3** | `domain/draw` |
| B10 | HTTP API داخلی (اختیاری): `/commands/*` برای Next proxy | **P2** | `apps/engines/bingo/src/http/` (آینده) |
| B11 | ۲–۳ replica + `WORKER_ROLE` split | **P1** | Docker/K8s/Railway |
| B12 | Redis leader lock روی scheduler/draw/tick | **P1** | `src/redis/locks.ts` |
| B13 | lobby snapshot cache در Redis (Next یا engine) | **P1** | TTL کوتاه |

---

### C) Database / SQL — **P0–P4**

| # | تغییر | اولویت | محل |
|---|--------|--------|-----|
| C1 | یک منبع migration (تصمیم: `winway/sql/migrations` canonical) | **P0** | docs + sync از `c:\Users\Pc\supabase` |
| C2 | deploy `sql/optimization/01–03` اگر روی prod نیست | **P0** | indexes + parallel draw workers |
| C3 | RPC `fn_lobby_snapshot_v2()` aggregate | **P1** | migration |
| C4 | RPC `fn_gameroom_view_v2()` | **P1** | migration |
| C5 | migration cutover: `cron.unschedule` heartbeat/draw | **P4** | `sql/migrations/YYYYMMDD_game_engine_cutover.sql` |
| C6 | feature flag table یا `app_runtime_flags.game_runtime` | **P0** | optional |
| C7 | monitor views/alerts: `draw_jobs` depth, `rooms_settling_lag` | **P0** | existing + doc |

---

### D) Next.js / Frontend — **P1–P3**

| # | تغییر | اولویت | فایل |
|---|--------|--------|------|
| D1 | `joinOrCreateRoom` → `POST /api/player/join-or-create-room` | **P2** | `services/rooms.ts`, route جدید |
| D2 | حذف `supabase.rpc("fn_join_or_create_room")` از client | **P2** | grep کل repo |
| D3 | lobby → `fn_lobby_snapshot_v2` (یک RPC) | **P1** | `app/api/player/lobby-snapshot` |
| D4 | live-room: فقط کارت‌های خود user (+ meta حریف) | **P1** | `app/api/player/live-room` |
| D5 | کاهش polling: lobby 10s→15–30s stable | **P1** | `app/player/lobby/page.tsx` |
| D6 | tournament registration فقط `fn_tournament_wallet_hold` | **P0** | verify — نه `fn_tournament_entry_upsert` مستقیم |
| D7 | env `GAME_ENGINE_URL` برای proxy (فاز ۲) | **P2** | `.env.example` |

---

### E) DevOps / Deploy — **P0–P4**

| # | تغییر | اولویت |
|---|--------|--------|
| E1 | staging با `GAME_RUNTIME=hybrid` | **P0** |
| E2 | secrets: `SUPABASE_SERVICE_ROLE_KEY` فقط روی engine | **P0** |
| E3 | CI: `game-engine` typecheck + build | **P1** |
| E4 | load test: 500 VU, 40 playing rooms | **P4** |
| E5 | runbook on-call | **P4** |
| E6 | Supabase compute: Medium/Large برای soak | **P4** |

---

### F) Tournament — **P2**

| # | تغییر | توضیح |
|---|--------|--------|
| F1 | engine `seatTournamentTable` جایگزین `fn_seat_table_players` | با verify assignment |
| F2 | حذف `set_config(jwt.claim.sub)` | anti-pattern |
| F3 | system join فقط از engine service account | `fn_system_join` یا logic در TS |
| F4 | تورنومنت price=0: skip wallet در room join OK اگر entry paid | document + test |

---

## 6. Inventory توابع DB

Legend: **MOVE** → engine | **WRAP** → RPC نازک بماند | **KEEP** → ledger/identity | **DEPRECATE** → حذف بعد cutover

### game_core

| تابع | تصمیم | اولویت |
|------|--------|--------|
| `fn_manage_room_live_actions` | MOVE | P1 |
| `fn_manage_waiting_rooms` | MOVE (orchestration) | P1 |
| `fn_join_or_create_room` / `_base` / `_core` | WRAP → `commands/join` | P2 |
| `fn_system_join_or_create_room` | WRAP (engine only) | P2 |
| `rpc_pick_draw_jobs` | WRAP → draw-processor | P0 |
| `rpc_apply_marks_for_draw` | MOVE (سپس P3) | P0→P3 |
| `fn_evaluate_room_after_draw` | MOVE (سپس P3) | P0→P3 |
| `fn_payout_room` / `fn_finish_room_and_settle` | WRAP (finance) | KEEP |
| `fn_generate_card_pool*` | KEEP (admin) | — |
| `fn_cancel_waiting_rooms` | WRAP | P2 |

### game_finance

| تابع | تصمیم |
|------|--------|
| `fn_wallet_apply_delta` | **KEEP** |
| `fn_wallet_hold_join` / `capture` / `release` | **KEEP** |
| `fn_record_ticket_commission` | **KEEP** |
| `fn_distribute_ticket_commission` | **KEEP** |
| `fn_finish_room_and_settle` | **KEEP** (engine triggers) |

### tournament

| تابع | تصمیم | اولویت |
|------|--------|--------|
| `fn_tick_due_tournaments` | MOVE | P2 |
| `fn_tick_tournament` | MOVE | P2 |
| `fn_seat_table_players` | MOVE | P2 |
| `fn_seat_players_for_round` | **DEPRECATE** | P0 |
| `fn_manage_tournament_cycle` | MOVE | P2 |
| `fn_assign_templates_for_round` | MOVE or WRAP | P2 |
| `fn_tournament_wallet_hold` | **KEEP** (player RPC) | — |
| `fn_tournament_entry_upsert` | **KEEP internal**, REVOKE client | P0 |

### public / cron

| تابع | تصمیم | اولویت |
|------|--------|--------|
| `fn_heartbeat_tick` | DEPRECATE (split to engine) | P1 |
| `fn_process_draw_jobs_batch*` | DEPRECATE | P0 |
| Edge `draw-worker` | DEPRECATE | P0 |

---

## 7. فازبندی اجرا

### فاز 0 — Foundation (هفته ۱)

- [x] ساختار `apps/engines/bingo/` + README
- [ ] Baseline metrics روی staging/prod
- [ ] Migration **A1–A4** (امنیت tournament + REVOKE)
- [ ] deploy draw optimization SQL اگر نشده
- [ ] staging: `GAME_RUNTIME=legacy_db` (فقط scaffold engine)

### فاز 1 — Hybrid draw (هفته ۱–۲) **P0**

- [ ] پیاده‌سازی `draw-processor` با RPCهای موجود
- [ ] `GAME_RUNTIME=hybrid` روی staging
- [ ] cron draw DB off؛ engine on
- [ ] load test: 20 playing room

### فاز 2 — Scheduler + read path (هفته ۲–۳) **P1**

- [ ] `room-scheduler` worker
- [ ] `fn_lobby_snapshot_v2` + تغییر API لابی
- [ ] live-room payload سبک
- [ ] load test: 300 CCU

### فاز 3 — Join + Tournament (هفته ۳–۵) **P2**

- [ ] `POST /api/player/join-or-create-room`
- [ ] tournament-orchestrator + seat commands
- [ ] حذف impersonation path
- [ ] load test: 500 CCU, 50 rooms

### فاز 4 — Full engine (هفته ۵–۷) **P3**

- [ ] evaluate/mark در TS
- [ ] REVOKE کامل game_core از client
- [ ] `GAME_RUNTIME=engine` روی staging soak 24h

### فاز 5 — Cutover (هفته ۷–۸) **P4**

- [ ] maintenance window
- [ ] migration cutover cron off
- [ ] deploy engine 3 replica + Next
- [ ] smoke + monitor 2h
- [ ] rollback plan tested

---

## 8. Cutover و Rollback

### Cutover checklist

1. `GAME_RUNTIME=engine` روی staging passed soak
2. `SELECT * FROM cron.job` — هیچ job بازی فعال نباشد
3. `draw_jobs` queue stable تحت load
4. engine health `/health` OK on all replicas
5. deploy migration REVOKE (A1–A4)
6. deploy engine → deploy Next
7. smoke: join, play one room, tournament seat, settle

### Rollback (< 15 min)

1. `GAME_RUNTIME=legacy_db` env روی engine (stop replicas)
2. re-enable `pg_cron` jobs (script در migration rollback)
3. redeploy Next قبلی
4. verify یک room complete cycle

---

## 9. معیارهای Done

| متریک | هدف |
|--------|-----|
| CCU | ≥ 500، error < 2% |
| playing rooms | 30–60 stable |
| draw lag p95 | < 10s after `next_draw_at` |
| `draw_jobs` queued | < 100 in peak, نزولی |
| settling lag | 0 rooms > 60s |
| lobby p95 | < 1s |
| security | `fn_tournament_entry_upsert` not callable from client |

---

## 10. ریسک‌ها

| ریسک | Mitigation |
|------|------------|
| دو موتور هم‌زمان | `GAME_RUNTIME` flag + cron guard |
| drift schema (`winway/sql` vs `Pc/supabase`) | C1: یک canonical path |
| service_role leak | فقط engine + Next server |
| tournament seat بدون pay | assignment + entry verify |
| زمان ۸ هفته | tournament tick can stay hybrid until P2 |

---

## پیوست: env vars

### game-engine (`.env`)

See `apps/engines/bingo/.env.example`

```env
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
```

### Next.js (آینده — cache لابی)

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
GAME_ENGINE_URL=http://game-engine:8080
GAME_RUNTIME=legacy_db
```

---

## پیوست: دستورات مفید

```bash
# Baseline
# rooms playing
# SELECT count(*) FROM rooms WHERE status = 'playing';
# draw queue
# SELECT status, count(*) FROM draw_jobs GROUP BY status;

# dev engine
cd apps/engines/bingo && npm install && npm run dev
```

---

**آخرین به‌روزرسانی:** 2026-05-27  
**مسئول سند:** تیم develop — branch `develop`
