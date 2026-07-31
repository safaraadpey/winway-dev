# Feature Flags and Legacy Paths Audit

> **Audit date:** 2026-07-31  
> **Scope:** Full repository (Next.js app, game-engine, SQL, scripts, docs, env examples)  
> **Mode:** Read-only — no code, config, migration, or deployment changes were made.  
> **Secrets:** Real secret values are intentionally omitted. Only variable *names* appear.
>
> ## Superseded (Wave 2A executed — 2026-07-31)
>
> Low-risk cleanup later removed root `@upstash/redis` / `ioredis`, orphan routes
> `lobby-room-groups` / `lobby-online-count` / `commission-summary`, and aligned
> docs. **DEV** game crons `bingo_*` were mutex-unscheduled separately (see
> runbook). Sections below that still list those as live inventory are
> **historical**. `GAME_RUNTIME` hybrid/`legacy_db` branches remain on purpose
> (rollback) — not deleted.

---

## Executive Summary

این پروژه هنوز در وضعیت **dual-path / cutover** است. چند Feature Flag و یک Runtime Selector سه‌حالته (`GAME_RUNTIME`) هم‌زمان مسیرهای قدیمی (Supabase RPC / Vercel API / pg_cron) و مسیرهای جدید (Railway Game Engine / room-loop actor / PG-first snapshots) را زنده نگه می‌دارند.

### یافته‌های کلیدی

1. **سه Feature Flag محصولی در Next.js** هنوز هر دو شاخه را اجرا می‌کنند:
   - `NEXT_PUBLIC_USE_GAME_ENGINE` (پیش‌فرض: خاموش)
   - `NEXT_PUBLIC_USE_CARD_POOL_CACHE` (پیش‌فرض: خاموش)
   - `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE` (پیش‌فرض کد: `orchestrator`؛ کامنت‌های «prod default: legacy» کهنه هستند)

2. **`GAME_RUNTIME=legacy_db|hybrid|engine`** هنوز در game-engine به‌طور کامل سیم‌کشی شده است. هیچ‌کدام از سه حالت حذف نشده‌اند. پیش‌فرض parse در کد: `legacy_db`؛ پیش‌فرض `.env.example`: `engine`.

3. **Kill switch عملیاتی مهم:** `SCHEDULER_ENABLED` (پیش‌فرض `false`) همه workerهای tick را قطع می‌کند — مستقل از runtime.

4. **ریسک عملیاتی Critical:** اگر `GAME_RUNTIME≠legacy_db` باشد ولی pg_cronهای بازی (`bingo_heartbeat`, `bingo_draw_worker_*`) هنوز active باشند، احتمال double-drive وجود دارد. کد فقط هشدار می‌دهد؛ auto-disable ندارد.

5. **وضعیت واقعی Production / Railway / Vercel env** از روی repo قابل اثبات نیست → همه جا به‌عنوان **نیازمند بررسی** علامت خورده‌اند.

6. **چند مورد Dead / Stale بدون حذف پیشنهادی در این مرحله:**
   - `@upstash/redis` در root `package.json` برای Next.js import نمی‌شود (فقط game-engine استفاده می‌کند)
   - کامنت `.env.local.example` درباره «lobby cache با Upstash» با کد فعلی Next هم‌خوان نیست
   - `ROOM_LOOP_MODE` / `loopMode.ts` از کد حذف شده‌اند ولی هنوز در برخی docs هستند
   - Edge functionهای remote روی DEV (spot-check) Hello stub هستند؛ سورس `supabase/functions/` در repo نیست
   - RPCهای raise-deprecated مالی هنوز در DB نصب‌اند ولی از TypeScript صدا زده نمی‌شوند

7. **هیچ cleanup در این مرحله انجام نشده است.** موج‌های پیشنهادی در انتهای گزارش فقط برای تأیید دستی هستند.

---

## Environment Variables Inventory

### Legend

| Type | Meaning |
|------|---------|
| Boolean | Compared to `"true"` / `"false"` |
| Enum | Closed set of string values |
| String / Number | Config / identity / URL |
| Secret | Credential — value never logged here |

| Name | Type | Default | Locations | True/New Path | False/Legacy Path | Dependencies | Current Status | Risk | Recommendation |
|------|------|---------|-----------|---------------|-------------------|--------------|----------------|------|----------------|
| `NEXT_PUBLIC_USE_GAME_ENGINE` | Boolean flag | unset → off | `lib/gameEngine/config.ts:5-9`; used via `services/rooms.ts`, `app/player/lobby/page.tsx`, `lib/gameEngineClient.ts` | Browser → Railway `/v1/*` | Vercel `/api/player/*` یا Supabase RPC | Needs `NEXT_PUBLIC_GAME_ENGINE_URL` + engine `GAME_ENGINE_API=true` | **Both paths live** | High (cutover) | **C/D** — keep until cutover confirmed |
| `NEXT_PUBLIC_GAME_ENGINE_URL` | String URL | `""` | `lib/gameEngine/config.ts:12-15`; `lib/gameEngineClient.ts:145` | Base URL for engine fetch | Flag cannot enable without it | CORS + JWT | Documented in README; **missing from `.env.local.example`** | High if flag on | **C** — required for engine path |
| `NEXT_PUBLIC_USE_CARD_POOL_CACHE` | Boolean flag | unset → off | `lib/cardPool/config.ts:5-6`; `lib/cardPool/client.ts:103,202`; `lib/cardPool/resolve.ts:26`; `services/rooms.ts:751` | IndexedDB + draws-only fallback | Full live-room card payloads | `/api/player/card-pool/definitions`, IDB `winway_card_pool_v1` | Opt-in; both live | Low–Medium | **C** (perf flag) or **D** if product drops cache |
| `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE` | Enum | `"orchestrator"` | `lib/contexts/ActiveGamesContext.tsx:17`; `lib/activeGames/ActiveGamesOrchestratorProvider.tsx:17`; `lib/hooks/useActiveGames.ts:55`; `components/GameEndResultsListener.tsx:51` | Orchestrator SSOT | Legacy `useActiveGames` poll+RT | Layout providers | Both live; comment about prod legacy is **stale** | Medium | **B/D** — confirm prod value before removing legacy |
| `NEXT_PUBLIC_SUPABASE_URL` | String | required | Many: `lib/supabase/env.ts:1`, `lib/supabaseServer.ts`, routes, scripts | N/A — infra | App broken if missing | Supabase project | Core config | Critical if missing | **C** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Secret | required | Same as above | N/A | Auth/SDK fail | Supabase | Core config | Critical | **C** |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | required (server) | `lib/supabaseServer.ts:13,327`; admin routes; seed scripts; engine via `SUPABASE_SERVICE_ROLE_KEY` | Server privileged path | Server routes fail | Never expose to browser | Core | Critical | **C** |
| `SUPABASE_URL` | String | required (engine) | `game-engine/src/config/env.ts:136` via `requireEnv` | Engine Supabase client | Engine throws on boot | Engine-only name (not `NEXT_PUBLIC_*`) | Core for engine | Critical | **C** |
| `DATABASE_URL` | Secret URI | unset → PG pool null | Next: `lib/pg.ts:9-14`; Engine: `game-engine/src/db/pg.ts:4`; logged presence in `game-engine/src/index.ts:122` | Direct PG snapshots / engine PG | Supabase SDK fallback | Vercel + Railway | **Both read paths live** | High for correctness | **C** — keep (PostgREST incident history) |
| `MAIN_APP_HOST` | String | `dingmoney.org` | `middleware.ts:22` | Host-based portal routing | Defaults | Middleware | Topology | Medium misconfig | **C** |
| `ADMIN_APP_HOST` | String | `admin.dingmoney.org` | `middleware.ts:23`; `app/layout.tsx:81` | Admin host / PWA | Defaults | Middleware + layout | Topology | Medium | **C** |
| `NEXT_PUBLIC_MAIN_HOST` | String | `dingmoney.org` | `lib/auth/portalHosts.ts:7` | Client host checks | Defaults | Auth/portal | Topology | Medium | **C** |
| `NEXT_PUBLIC_ADMIN_HOST` | String | `admin.dingmoney.org` | `lib/auth/portalHosts.ts:11`; `app/layout.tsx:82` | Admin UI host | Defaults | Portal | Topology | Medium | **C** |
| `NEXT_PUBLIC_MAIN_ORIGIN` | String URL | `https://dingmoney.org` | `lib/auth/portalHosts.ts:23`; `app/layout.tsx:23`; signup/tournaments layouts | Absolute links / metadata | Defaults | SEO / redirects | Topology | Medium | **C** |
| `NEXT_PUBLIC_ADMIN_ORIGIN` | String URL | `https://admin.dingmoney.org` | `lib/auth/portalHosts.ts:15`; `.env.local.example:6` | Admin origin redirects | Defaults | Auth | Topology | Medium | **C** |
| `UPSTASH_REDIS_REST_URL` | Secret URL | null | Engine: `env.ts:139`; `redis/client.ts`; examples comment in Next `.env*` | Redis locks / coordination | Single-instance mode | Pair with token | **Not read by Next.ts** | Medium (engine multi-replica) | **C** for engine; Next example claim is stale (**A** for Next docs only) |
| `UPSTASH_REDIS_REST_TOKEN` | Secret | null | Same | Same | Same | Same | Same | Same | Same |
| `REDIS_URL` | Secret URL | null | `env.ts:138`; preferred protocol URL | ioredis path | Fall back to REST or none | Multi-replica | Engine | Medium–High | **C** |
| `GAME_RUNTIME` | Enum | parse → `legacy_db` | `game-engine/src/config/env.ts:124-126,142`; `runtime.ts:13-25`; all workers | See Runtime Selectors | Cron-owned when `legacy_db` | Roles + SCHEDULER + cron mutex | **All 3 modes executable** | **Critical** misconfig | **C/D** — architecture decision |
| `GAME_ENGINE_ROLES` | CSV Enum | empty set | `env.ts:101-116,141` | Which workers start | Role absent → that worker not started | `SCHEDULER_ENABLED` | Operational | High | **C** |
| `SCHEDULER_ENABLED` | Boolean kill switch | unset → false | `env.ts:224`; `index.ts` worker gate | Tick workers run | API/health only | All scheduled roles | Default safe-off | Critical if wrong | **C** — keep |
| `GAME_ENGINE_API` | Boolean | unset → false | `env.ts:144`; `index.ts:139-144` | Mount `/v1/*` | Health-only HTTP | Needed for Next engine flag | **نیازمند بررسی** prod | High | **C** |
| `GAME_ENGINE_HTTP_PORT` | Number | `8080` | `env.ts:143` | Listen port | — | Docker EXPOSE 8080 | Config | Low | **C** |
| `GAME_ENGINE_CORS_ORIGINS` | String CSV | `*` (cors.ts) | `game-engine/src/http/cors.ts:8` | Allowed browser origins | Default `*` insecure for prod | Browser ENGINE_PATH | **نیازمند بررسی** prod | High security | **C** |
| `ENABLE_SHADOW_PARITY` | Boolean debug | unset → false | `env.ts:218`; room-loop / `roomLoopManager` / `shadowCycle.ts` | Observe-only shadow in hybrid | No shadow | `GAME_RUNTIME=hybrid` + room-loop | Debug leftover | Medium if on in prod | **C** debug / **B** if retiring |
| `COORDINATION_STRICT` | Boolean safety | unset → false | `env.ts:227`; `startupGate.ts` | Fail-closed without Redis | Soft-warn multi-replica | Redis + replica count | Scale gate | High if scaling | **C** |
| `ENGINE_REPLICA_COUNT` | Number | `1` | `env.ts:228` | Startup warnings | — | Coordination | Ops | Medium | **C** |
| `ENGINE_ID` | String | derived from HOSTNAME/RAILWAY | `engineIdentity.ts:14-15` | Replica identity | `engine` fallback | Multi-replica | Ops | Medium | **C** |
| `HOSTNAME` | String | platform | `engineIdentity.ts:14` | Identity input | — | Container | Ops | Low | **C** |
| `RAILWAY_REPLICA_ID` | String | platform | `engineIdentity.ts:14` | Identity input | — | Railway | Ops | Low | **C** |
| `LOG_LEVEL` | String | `info` | `env.ts:145` | Logging verbosity | — | Observability | Config | Low | **C** |
| `DRAW_PROCESSOR_*` | Number/Boolean tunables | see `.env.example` | `env.ts:146-177` | Engine draw drain behavior | Defaults | draw-processor role | Tuning | Medium | **C** |
| `DRAW_JOB_STALE_SEC` / `DRAW_JOB_REAP_INTERVAL_MS` / `DRAW_ROOM_LOCK_TTL_SEC` | Number | 120 / 30000 / 120 | `env.ts:191-195` | Crash recovery / locks | Off if 0 for room lock | engine draw path | Tuning | Medium | **C** |
| `DRAW_PICK_DIAGNOSTICS` | Boolean | false | `env.ts:225` | Extra pick DB logs | Quiet | Hot path | Debug | Low | **C** |
| `DRAW_PICK_IDLE_BACKOFF` | Boolean (opt-out) | true unless `"false"` | `env.ts:226` | Backoff empty polls | Always fast poll | draw-processor | Tuning | Low | **C** |
| `ROOM_SCHEDULER_INTERVAL_MS` | Number | 1000 | `env.ts:180` | Scheduler tick | — | scheduler role | Tuning | Medium | **C** |
| `ROOM_STATE_CHECKPOINT_EVERY` | Number | 10 | `env.ts:189` | Marks checkpoint cadence | 0 disables | engine | Tuning | Medium | **C** |
| `ROOM_JANITOR_*` | Number | 60000 / 20 | `env.ts:197-199` | Engine repair janitor | 0 interval disables | **engine runtime only** | Tuning | Medium | **C** |
| `ROOM_LOOP_*` | Number | 1000 / 30 / 50 | `env.ts:219-222` | Actor discovery/lease/cap | — | room-loop + engine | Tuning | High | **C** |
| `TOURNAMENT_TICK_*` | Number | 2000 / 50 | `env.ts:183-186` | Tournament orchestrator | — | tournament role | Tuning | Medium | **C** |
| `DEV_PLAYER_*` | Number | see env.ts | `env.ts:201-216`; stuck timeout also `processor.ts:29` | Dev-player workers | Defaults | Independent of `GAME_RUNTIME` | Dev tooling | Medium | **C** / **D** for prod |
| `SCHEDULER_LOCK_TTL_SEC` / `TOURNAMENT_LOCK_TTL_SEC` / `ENGINE_HEARTBEAT_*` / `ENGINE_DRAIN_TIMEOUT_MS` / `LOCK_RENEW_INTERVAL_MS` | Number | see env.ts | `env.ts:229-236` | Multi-replica locks / drain | Defaults | Redis | Scale | High when scaling | **C** |
| `NODE_ENV` | Enum (framework) | build-time | Many UI/debug gates | production strips some logs/PWA debug | development verbosity | Next/Node | Framework | N/A | **C** — not product flag |

### Reading patterns observed

```ts
process.env.FEATURE === "true"          // opt-in flags
process.env.FEATURE !== "false"         // opt-out defaults (several DRAW_PROCESSOR_*)
Number(process.env.X ?? "default")      // tunables
requireEnv("NAME")                      // hard-fail boot (SUPABASE_*)
optionalEnv("NAME")                     // null if unset (Redis)
parseRuntime(raw)                       // unknown → legacy_db
```

### If unset — behavior summary

| Variable class | If unset |
|----------------|----------|
| Next feature flags (`USE_*`) | Legacy / cache-off paths |
| `ACTIVE_GAMES_SOURCE` | Orchestrator |
| `GAME_RUNTIME` | `legacy_db` (workers idle if started) |
| `SCHEDULER_ENABLED` / `GAME_ENGINE_API` | Workers off / health-only |
| `DATABASE_URL` | PG helpers null → Supabase fallback |
| Host/origin vars | Hardcoded dingmoney defaults |
| Redis vars | Single-instance; strict mode may block ticks |

---

## Feature Flags Inventory

| Name | Type | Default | Locations | True/New Path | False/Legacy Path | Dependencies | Current Status | Risk | Recommendation |
|------|------|---------|-----------|---------------|-------------------|--------------|----------------|------|----------------|
| `NEXT_PUBLIC_USE_GAME_ENGINE` | Feature flag | off | `lib/gameEngine/config.ts:5-9` | `lib/gameEngineClient.ts` → `/v1/lobby`, `/v1/gameroom`, `/v1/live-room`, `/v1/rooms/join` | Lobby: `/api/player/lobby-snapshot`; Join: `fn_join_or_create_room`; Gameroom/Live: Vercel routes | Engine API + CORS + URL | **Both executable** | High | Keep (**C/D**) |
| `NEXT_PUBLIC_USE_CARD_POOL_CACHE` | Feature flag | off | `lib/cardPool/config.ts:5-6` | Warm IDB + optional `scope=draws` poll | Always full card grids in snapshot | Card-pool definitions API | Both live | Low–Med | Keep (**C**) |
| `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE` | Feature flag / selector | `orchestrator` | Context + Provider + hook + GameEndResultsListener | `ActiveGamesOrchestrator` | Full legacy hook + listener polling | Player layout providers | Both live | Medium | Confirm then possibly retire legacy (**B/D**) |
| `ENABLE_SHADOW_PARITY` | Debug flag | off | `env.ts:218`, room-loop | `shadowCycle.ts` observe-only | No shadow claims | hybrid + room-loop | Live but unused in actor/engine write path | Med if prod-on | Keep as debug (**C**) or retire after decision (**B**) |
| `SCHEDULER_ENABLED` | Kill switch | off | `env.ts:224`, `index.ts` | All tick workers | No scheduled work | Roles | Essential safety | Critical if wrong | **Must remain (C)** |
| `GAME_ENGINE_API` | Capability switch | off | `env.ts:144` | Command API | Health only | Next ENGINE_PATH | Essential for cutover | High | **C** |
| `COORDINATION_STRICT` | Safety switch | off | `env.ts:227` | Fail closed sans Redis | Allow soft degrade | Multi-replica | Scale safety | High | **C** |
| `DRAW_PICK_DIAGNOSTICS` | Debug | off | `env.ts:225` | Verbose pick snapshots | Quiet | draw-processor | Debug | Low | **C** |

### Dual-path detail: Game Engine (Next)

| Flow | Entry | New | Legacy | Fallback on engine failure |
|------|-------|-----|--------|----------------------------|
| Join | `services/rooms.ts:222-254` | `joinOrCreateRoomViaEngine` → `POST /v1/rooms/join` → `fn_system_join_or_create_room` | `supabase.rpc("fn_join_or_create_room")` | **None** — throws |
| Lobby | `app/player/lobby/page.tsx:152-155` | `getLobby` → `/v1/lobby` | `GET /api/player/lobby-snapshot` | **None** (outer catch only) |
| Gameroom | `services/rooms.ts:649-686` | `/v1/gameroom` | `GET /api/player/gameroom` | **Yes** → Vercel |
| Live-room | `services/rooms.ts:738-749` | `/v1/live-room` | `GET /api/player/live-room` | **Yes** → Vercel (`[FALLBACK_PATH]`) |

Log markers: `[ENGINE_PATH]`, `[LEGACY_PATH]`, `[FALLBACK_PATH]` in `lib/gameEngineClient.ts` / `services/rooms.ts` / lobby page.

### Dual-path detail: Active Games

```text
NEXT_PUBLIC_ACTIVE_GAMES_SOURCE
→ ActiveGamesProvider / OrchestratorProvider
→ orchestrator: ActiveGamesOrchestrator (single RT + poll health)
→ legacy: useActiveGames (full poll + RT) + GameEndResultsListener fetch /api/player/my-active-rooms
```

**Note:** Comments in `ActiveGamesContext.tsx:13-14` claim «prod default: legacy» but code default is `orchestrator`. **نیازمند بررسی:** مقدار واقعی در Vercel production.

### Dual-path detail: Card Pool Cache

```text
NEXT_PUBLIC_USE_CARD_POOL_CACHE=true
→ ensureCardPoolCache (memory + IndexedDB)
→ applyCardPoolCacheToSnapshot
→ LiveRoomScreen may poll scope=draws when warm
false → full cards from live-room API; IDB inert
```

---

## Runtime Selectors

### `GAME_RUNTIME` (`legacy_db` | `hybrid` | `engine`)

**Parse:** `game-engine/src/config/env.ts:124-126` — unknown/missing → **`legacy_db`**.  
**Helpers:** `game-engine/src/runtime.ts:13-25`.

| Mode | `isIdle` | `drivesLoops` | `executesBusinessLogic` |
|------|----------|---------------|-------------------------|
| `legacy_db` | true | false | false |
| `hybrid` | false | true | false |
| `engine` | false | true | true |

| Worker | legacy_db | hybrid | engine |
|--------|-----------|--------|--------|
| room-scheduler | idle | `fn_heartbeat_tick` RPC | TS `manageWaitingRooms` + janitor repair RPC |
| draw-processor | idle | RPC pick/marks/evaluate | TS marks/eval (+ per-room actors default) |
| room-loop | idle | manager; shadow only if flag | `runOneDrawCycle` owns live clock |
| tournament-orchestrator | idle | `fn_tick_due_tournaments` | TS select + `fn_tick_tournament` |
| dev-player-* | **independent of GAME_RUNTIME** | same | same |

**Prerequisite for any worker ticks:** `SCHEDULER_ENABLED=true` **and** role in `GAME_ENGINE_ROLES`.

### Dependency chain (canonical)

```text
ENV GAME_RUNTIME + GAME_ENGINE_ROLES + SCHEDULER_ENABLED
→ loadConfig() (game-engine/src/config/env.ts)
→ index.ts startScheduledWorkers
→ room-scheduler / draw-processor / room-loop / tournament-orchestrator
→ Redis leader locks (optional/strict)
→ DB RPCs (fn_heartbeat_tick | rpc_pick_draw_jobs | fn_evaluate_room_after_draw |
           fn_finish_room_and_settle | fn_tick_* | lease RPCs | janitor repair)
→ tables: rooms, draws, draw_jobs, tickets/cards, tournaments, wallets
→ parallel authority risk: pg_cron bingo_* / tournament tick (manual DISABLE scripts)
```

### `GAME_ENGINE_ROLES` values

`scheduler` | `draw-processor` | `room-loop` | `tournament-orchestrator` | `dev-player-scheduler` | `dev-player-processor`  
(`env.ts:2-9`, parser `101-116`)

### Removed selector (docs-only remnant)

| Name | Code status | Docs status |
|------|-------------|-------------|
| `ROOM_LOOP_MODE` / `loopMode.ts` | **Absent** from `.ts` | Still mentioned in older architecture docs / ADR history |

---

## Legacy Code Paths

| Path / Symbol | Evidence | Still used? | Notes | Class |
|---------------|----------|-------------|-------|-------|
| `[LEGACY_PATH]` join/lobby/gameroom/live-room | `services/rooms.ts:243,659,662,747`; lobby `:155` | **Yes** when flag off (and fallbacks) | Primary rollback | B/C |
| Supabase `fn_join_or_create_room` | `services/rooms.ts:250` | **Yes** (default path) | Parallel to `fn_system_join_or_create_room` on engine | C/D |
| Vercel `/api/player/gameroom` | `services/rooms.ts:676` | **Yes** | PG-first + Supabase | C |
| Vercel `/api/player/live-room` | `services/rooms.ts` fallback | **Yes** | Same | C |
| Active Games legacy hook | `useActiveGames.ts` when source=`legacy` | **Yes** if flag set | Rollback | B |
| `GAME_RUNTIME=legacy_db` / `hybrid` branches | All workers | **Yes** — executable | Ops rollback | C |
| `shadowCycle.ts` | room-loop hybrid debug | Only if `ENABLE_SHADOW_PARITY` | Observe-only | B/C |
| Soft payout shims (`fn_payout_*`) | stage3 migration | No TS callers | DB still callable | B |
| Raise-deprecated finance RPCs | `20251202233000_stage7…:66,77` | No TS callers | Runtime traps | A/B |
| `@deprecated` commission-summary API | `app/api/admin/dashboard/commission-summary/route.ts:1-3` | UI uses snapshot; route still serves | App legacy | A/B |
| Edge draw/dev workers | Docs + remote stubs | Remote Hello stubs on DEV spot-check; **no `supabase/functions/` source** | Docs drift | B |
| `ROOM_LOOP_MODE` | Removed per ADR 0001 | Docs only | Stale docs | A (docs) |
| `user_profiles_old_backup` | system-map docs; exists on DEV | Backup table | **نیازمند بررسی** before drop | B |
| Upstash lobby cache on Next | `.env.local.example:11-13` comment | **No Next consumer** | Stale comment + unused root dep | A |

**Naming-only hits (not automatically legacy):** many `fallback` strings mean graceful degrade (auth column fallback, PG→Supabase snapshot fallback, audio, etc.) — treat as **C** unless proven unused.

---

## Potential Dead Code

| Item | Observation | Confidence | Action now |
|------|-------------|------------|------------|
| Root `@upstash/redis` dependency | Only imported in `game-engine/src/redis/client.ts`; Next app does not import | High | Do not delete package without checking workspace install model — **B** |
| Next Upstash env for «lobby cache» | Documented in `.env.local.example` but no Next `.ts` reader | High | Docs/example cleanup candidate — **A** |
| `ROOM_LOOP_MODE` code | Gone | High | Docs cleanup — **A** |
| Raise-deprecated RPCs | Installed; no TS callers | High for TS; **نیازمند بررسی** for SQL/cron callers | **A/B** |
| Soft payout aliases | No TS callers | Medium | **B** — grep DB dependents |
| `fn_adjust_wallet_manual` | Admin uses `fn_wallet_apply_delta` | Medium | **B** |
| commission-summary route | Marked deprecated; snapshot preferred | Medium | **A/B** — confirm no external clients |
| Edge function source | Missing from repo; remote stubs | High for repo absence | **B** — confirm prod |
| Flags stuck to one value in prod | **Cannot verify from repo** | — | **نیازمند بررسی** |
| Env defined in deploy but unread | **Cannot verify from repo** | — | **نیازمند بررسی** |
| Unregistered workers | Workers only start via `GAME_ENGINE_ROLES` + `SCHEDULER_ENABLED` | High | Misconfig = idle, not dead code |

---

## Database Legacy Objects

> Spot-check of **DEV** Supabase via MCP was used for cron/edge status. **Production inventory is نیازمند بررسی.**

### Deprecated / shim functions

| Object | Defined | App callers | Coexist with new? | Deletion risk | History vs runtime |
|--------|---------|-------------|-------------------|---------------|-------------------|
| `game_finance.fn_wallet_capture_and_distribute` | `sql/migrations/20251202233000_stage7_cleanup_monitor.sql:59-68` | None in TS | Replaced by `fn_finish_room_and_settle` | Low–Med | **Runtime trap** |
| `game_finance.fn_consume_room_tickets` | same `:70-79` | None in TS | Inlined into settle | Low–Med | **Runtime trap** |
| `public.fn_payout_room_if_full` + `fn_payout_room_prize` / `fn_payout_winners` / `game_core.fn_payout_room` | `20251202223000_stage3…:401+` | None in TS | Delegate to settle | Medium | **Runtime shims** |
| `public.fn_adjust_wallet_manual` | refactor migration | None in TS (admin → `fn_wallet_apply_delta`) | Wrapper | Medium | **Runtime wrapper** |
| Join shims `fn_join_or_create_room_base` → core | `20260615180000_…` etc. | Via public join wrappers | Yes | Medium | **Runtime** |

### Dual ownership (app vs cron)

| Capability | DB/cron path | Engine path | Mutex |
|------------|--------------|-------------|-------|
| Waiting + live clock | `bingo_heartbeat` → `fn_heartbeat_tick` | hybrid: same RPC; engine: TS waiting + room-loop draws | Manual SQL scripts + migrations |
| Draw drain | `bingo_draw_worker_1..3` → `fn_process_draw_jobs_batch_worker` | draw-processor | **No migration** disables workers — only `scripts/game-engine-cron-draw-workers.sql` |
| Tournament tick | cron `tournament.fn_tick_due_tournaments` | tournament-orchestrator | Phase5 migration unschedules; RESTORE in script |
| Janitor | cron `fn_janitor_sweep` (full) | engine calls `fn_janitor_repair_unsettled_finished` only | Partial dual — docs say keep sweep |
| Dev players | historical edge http cron | engine dev-player roles | Independent of `GAME_RUNTIME` |

### Operator scripts

| Script | DISABLE | RESTORE |
|--------|---------|---------|
| `scripts/game-engine-cron-heartbeat.sql` | active unschedule | restore commented |
| `scripts/game-engine-cron-draw-workers.sql` | active unschedule | **RESTORE uncommented** — footgun if whole file executed |
| `scripts/game-engine-cron-tournament.sql` | active unschedule | restore commented |
| `scripts/dev-schedule-worker-cron.sql` | unschedule bot/dev | enable commented |

### DEV cron snapshot (spot-check — نیازمند تأیید مجدد)

Active on DEV at audit time: `fn_generate_card_pool_step`, `fn_janitor_sweep`, partition/cleanup jobs, **`bingo_heartbeat`**, **`bingo_draw_worker_1..3`**.  
Tournament tick cron: absent on DEV.  
**Conflict note:** migration `20260602120000_…` claims to disable heartbeat, yet DEV still showed `bingo_heartbeat` active → **نیازمند بررسی** (restore / different history / wrong project).

### Edge functions (DEV spot-check)

`heartbeat`, `draw-worker`, `generate-card-pool`, `dev-schedule-worker` — ACTIVE but Hello stub bodies. Repo lacks `supabase/functions/` sources.

### Tables

| Object | Note | Class |
|--------|------|-------|
| `user_profiles_old_backup` | Documented unused; exists live | B |
| `heartbeat_log_*` partitions | Runtime | C |
| `debug_room_status_log` | Diagnostics | C / security review |

**Do not treat historical migrations as deletable runtime objects.**

---

## Deployment Configuration Gaps

| Gap | Detail |
|-----|--------|
| No `vercel.json` / `.github/workflows` / `railway.toml` in repo | Deploy env is outside git — values **UNKNOWN** |
| Production values unknown | `NEXT_PUBLIC_USE_GAME_ENGINE`, `GAME_RUNTIME`, `SCHEDULER_ENABLED`, `GAME_ENGINE_API`, CORS, cron active set |
| `.env.local.example` incomplete vs README | Missing `NEXT_PUBLIC_USE_GAME_ENGINE`, `NEXT_PUBLIC_GAME_ENGINE_URL`, `NEXT_PUBLIC_USE_CARD_POOL_CACHE`, host vars partially present |
| `.env.develop.local.example` | Has `ACTIVE_GAMES_SOURCE`; comments Upstash/DATABASE_URL; no game-engine Next flags |
| `game-engine/.env.example` | Defaults `GAME_RUNTIME=engine`, `SCHEDULER_ENABLED=false` |
| `game-engine/.env.develop.local.example` | `GAME_RUNTIME=legacy_db`, limited roles, scheduler off |
| README structure section | Paths like `app/(protected)/lobby` look **stale** vs current `app/player/...` |
| Docs contradictions | `API_REQUEST_GRAPH_REPORT.md` claims engine Next flags «not in code yet» — **false today**; `system-overview.md` / `game-engine-reality.md` still say engine dormant/`legacy_db` — may be outdated vs ADR intent |
| Dockerfile | Sets `NODE_ENV=production` only; all other env expected at runtime |

---

## Documentation Gaps

| Topic | Issue |
|-------|-------|
| Feature flag inventory | Scattered across migration reports; no single living matrix (this audit is first dedicated file) |
| Active Games default | Code vs comments vs docs disagree |
| Upstash on Next | Example promises lobby cache; code does not |
| ROOM_LOOP_MODE | Documented as removed in ADR but older architecture pages still instruct on it |
| Edge workers | Docs reference functions without repo source |
| Cron ↔ runtime mutex | Described in runbooks; not automated; DEV state may contradict migrations |
| `lib/db/postgres.ts` | Mentioned in workspace rules; actual module is `lib/pg.ts` |

---

## Risk Assessment

| Risk | Severity | Why |
|------|----------|-----|
| Cron + engine both driving draws/rooms | **Critical** | Double promote / double draw |
| `NEXT_PUBLIC_USE_GAME_ENGINE=true` without API/CORS/URL | **High** | Join/lobby hard-fail; gameroom/live may fallback |
| Removing legacy Next paths before prod flag proven on | **High** | Breaks default (flag-off) traffic |
| Dropping `DATABASE_URL` on Vercel | **High** | Snapshot correctness regressions |
| Enabling `ENABLE_SHADOW_PARITY` in prod | **Medium** | Extra load / confusion (observe-only) |
| Scaling replicas without Redis + `COORDINATION_STRICT` | **High** | Split-brain locks |
| Dropping raise-deprecated RPCs without DB dependent scan | **Medium** | Hidden SQL callers |
| Running draw-worker SQL script top-to-bottom | **High** | Uncommented RESTORE re-enables cron |
| Stale docs guiding operators | **Medium** | Wrong rollback / wrong assumed mode |

---

## Recommended Cleanup Waves

> **No wave has been executed.** Each requires explicit human approval after this report.

### Wave 1 — Low-risk env / docs / example hygiene

**Items:** Fix `.env*.example` comments (Upstash lobby cache); document all Next flags in examples; mark stale README paths; note `ROOM_LOOP_MODE` removal in outdated docs; inventory unused root `@upstash/redis` for Next.  
**Prereq:** None (docs/examples only).  
**Tests:** Diff review only.  
**Rollback:** Revert doc commit.  
**Risk:** Low

### Wave 2 — Frontend / UI legacy paths

**Items:** Active Games `legacy` branch + GameEndResultsListener polling; card-pool flag only after product confirms always-on/off; optional remove `[LEGACY_PATH]` log noise after cutover.  
**Prereq:** Confirm Vercel `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE` and soak orchestrator; confirm card-pool flag intent.  
**Tests:** Player lobby header active games, game-end results, hard exit, PWA.  
**Rollback:** Re-set source=`legacy` / cache flag.  
**Risk:** Medium

### Wave 3 — API / Service legacy paths

**Items:** Retire Vercel-only reliance for lobby/join/gameroom/live-room after engine cutover; deprecate commission-summary route; keep PG-first routes until proven.  
**Prereq:** `NEXT_PUBLIC_USE_GAME_ENGINE=true` stable in staging+prod; join without fallback validated; CORS locked.  
**Tests:** Join idempotency, wallet debit once, lobby parity, live draw sync, cancel waiting room.  
**Rollback:** Flag off → legacy paths.  
**Risk:** High

### Wave 4 — Game Engine / Scheduler / Worker / Queue

**Items:** Decide fate of `hybrid` and `legacy_db` code branches; shadow parity; draw-processor hybrid RPC path; ensure roles match ADR (actor-only).  
**Prereq:** Production `GAME_RUNTIME` known; cron mutex verified; soak metrics.  
**Tests:** Load-test draw, multi-replica gate, SIGTERM drain, janitor repair, tournament tick.  
**Rollback:** `GAME_RUNTIME=legacy_db` + cron RESTORE scripts (if DB authority still valid).  
**Risk:** Critical

### Wave 5 — Supabase RPC / Function / Trigger / Cron

**Items:** Drop raise-deprecated finance stubs; soft payout aliases after dependent scan; reconcile heartbeat/draw/tournament cron with engine ownership; replace or delete Hello edge stubs.  
**Prereq:** Wave 4 ownership decision; DB dependency grep; backup.  
**Tests:** Settlement, join, heartbeat-off soak, edge cron absent.  
**Rollback:** Migration down / RESTORE SQL.  
**Risk:** Critical for cron; Medium for dead RPCs

### Wave 6 — Table / Column / Index / Policy

**Items:** `user_profiles_old_backup`; unused indexes/policies only after evidence; never drop migration history files as “cleanup”.  
**Prereq:** Export backup; confirm zero reads.  
**Tests:** Auth/profile flows, RLS checks.  
**Rollback:** Restore table from backup.  
**Risk:** Medium–High

### Wave 7 — Documentation & deployment configuration

**Items:** Single source-of-truth env matrix; sync system-map with reality; Vercel/Railway checklist with actual values (stored outside git); remove contradictory “not in code yet” statements.  
**Prereq:** Waves 1–5 decisions recorded.  
**Tests:** Operator dry-run of runbooks.  
**Rollback:** Doc revert.  
**Risk:** Low (docs) / High if wrong runbook left live

---

## Items Requiring Manual Confirmation

1. **Production Vercel env:** values of `NEXT_PUBLIC_USE_GAME_ENGINE`, `NEXT_PUBLIC_GAME_ENGINE_URL`, `NEXT_PUBLIC_USE_CARD_POOL_CACHE`, `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE`, `DATABASE_URL` presence.
2. **Production Railway env:** `GAME_RUNTIME`, `SCHEDULER_ENABLED`, `GAME_ENGINE_API`, `GAME_ENGINE_ROLES`, `GAME_ENGINE_CORS_ORIGINS`, Redis, `COORDINATION_STRICT`, replica count.
3. **Production / each Supabase project cron.job inventory** vs engine ownership (especially `bingo_heartbeat`, `bingo_draw_worker_*`, tournament tick, `fn_janitor_sweep`).
4. Why DEV still has `bingo_heartbeat` active despite phase2 disable migration — restore? wrong project? migration not applied?
5. Whether tournaments progress on environments without tournament cron (engine orchestrator running?).
6. Whether any external client still calls `/api/admin/dashboard/commission-summary`.
7. Whether soft payout RPCs / raise-deprecated functions are granted to roles that could still invoke them.
8. Whether root `@upstash/redis` is required for a monorepo hoist or can be engine-only.
9. Product decision: keep `hybrid`/`legacy_db` indefinitely as emergency fallback (**C**) or schedule decommission (**D**).
10. Product decision: Active Games legacy path retention window.
11. Confirm edge function stubs on prod and whether any http cron still posts to them.
12. Align workspace rule path `lib/db/postgres.ts` with actual `lib/pg.ts` (docs/rules only).

---

## Classification Quick Index

| Class | Meaning | Examples from this audit |
|-------|---------|--------------------------|
| **A** | Probably removable | Stale Upstash-on-Next example text; ROOM_LOOP_MODE docs; raise-deprecated RPCs after DB scan; unused commission route after client scan |
| **B** | Needs tests / confirmation first | Active Games legacy; soft payout shims; edge stubs; hybrid branches; DEV cron anomalies |
| **C** | Must keep | `SCHEDULER_ENABLED`, host/origin config, secrets, `DATABASE_URL`, Redis/coordination, most tunables, kill/debug switches, current dual paths until cutover proven |
| **D** | Needs product/architecture decision | Retire `GAME_RUNTIME` modes; force engine-only Next flag; always-on card pool cache; drop legacy join RPC path |

---

## Appendix A — File index (primary)

| Area | Paths |
|------|-------|
| Next flags | `lib/gameEngine/config.ts`, `lib/cardPool/config.ts`, `lib/contexts/ActiveGamesContext.tsx` |
| Path shim | `lib/gameEngineClient.ts`, `services/rooms.ts`, `app/player/lobby/page.tsx` |
| Engine config | `game-engine/src/config/env.ts`, `game-engine/src/runtime.ts`, `game-engine/src/index.ts` |
| Workers | `game-engine/src/workers/**` |
| PG access | `lib/pg.ts`, `game-engine/src/db/pg.ts` |
| Env examples | `.env.local.example`, `.env.develop.local.example`, `game-engine/.env.example`, `game-engine/.env.develop.local.example` |
| Cron scripts | `scripts/game-engine-cron-*.sql`, `scripts/dev-schedule-worker-cron.sql` |
| ADR | `docs/adr/0001-actor-only-live-draw-loop.md` |

## Appendix B — Explicit non-actions

This audit did **not**:

- modify any source file other than creating this report
- rename/delete env vars
- drop DB objects
- change Vercel/Railway/Supabase config
- create git commits
- apply migrations
- auto-fix dead code

**Next step:** Human review and approval of selected cleanup waves before any implementation work.
