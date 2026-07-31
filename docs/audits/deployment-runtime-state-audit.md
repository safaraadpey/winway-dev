# Deployment Runtime State Audit

> **Audit date:** 2026-07-31  
> **Mode:** Read-only — no env changes, cron changes, migrations, deploys, commits, or code edits.  
> **Secrets policy:** Values never printed. Only `present` / `missing` / `unknown`. Non-secret flags and public URLs may be shown.  
> **Baseline repo audit:** `docs/audits/feature-flags-legacy-paths-audit.md`
>
> ## Superseded (Wave 2A / mutex — 2026-07-31)
>
> Sections below that list **`bingo_heartbeat` / `bingo_draw_worker_*` as ACTIVE** on
> Supabase `yqnptpreowkimopxicfz` are **historical**. After the DEV cron mutex apply,
> those jobs are **unscheduled**. Railway Game Engine is the game runtime owner on
> this Final Pre-Launch infrastructure; Supabase remains SoR + maintenance crons.
> See `docs/runbooks/dev-game-cron-mutex-apply.md` and `docs/system-map/game-engine-reality.md`.
> **Do not** treat this audit’s pre-mutex cron tables as current authority.
> Hybrid / `legacy_db` code paths remain as **rollback surfaces** (not deleted).

---

## Executive Summary

وضعیت واقعی با فرض‌های «flag پیش‌فرض خاموش» در README/repo **متفاوت** است.

| محیط | Next path | شواهد Railway | Supabase authority |
|------|-----------|---------------|-------------------|
| **Production** (`www.dingmoney.org` / Vercel `winway`) | **Engine path روشن** (`NEXT_PUBLIC_USE_GAME_ENGINE=true` → `https://winway-production.up.railway.app`) | API `/v1` زنده؛ Redis **up**؛ CORS allowlist (نه `*`) | Cron inventory: **ACCESS NOT AVAILABLE** |
| **Development / Staging** (`dev.dingmoney.org` / Vercel `winway-dev`) | **Engine path روشن** → `https://winway-dev-production.up.railway.app` | API `/v1` زنده؛ Redis **disabled** | MCP `supabase_dev` (`yqnptpreowkimopxicfz`): **`bingo_heartbeat` + `bingo_draw_worker_1..3` همه ACTIVE** |

یافته‌های Critical:

1. **Vercel (prod + staging) Engine Flag = true** در حالی که audit قبلی مقدار prod را UNKNOWN می‌دانست و README پیش‌فرض را false می‌گذارد → **CONTRADICTED / OUTDATED DOCUMENTATION**.
2. روی **Supabase DEV** همزمان: engine اخیراً room lease زده (`engine_claimed_at` امروز) **و** pg_cron heartbeat/draw workers فعال‌اند → **ریسک double-drive** وقتی اتاق live باشد.
3. Migration `game_engine_phase2_disable_heartbeat_cron` روی DEV **اعمال شده** ولی `bingo_heartbeat` هنوز active → بعداً RESTORE/دوباره schedule شده یا unschedule بدون اثر پایدار.
4. **`NEXT_PUBLIC_ACTIVE_GAMES_SOURCE=legacy`** روی Vercel (برخلاف default کد = `orchestrator` و کامنت‌های SSOT).
5. **Railway env کامل** (`GAME_RUNTIME`, `SCHEDULER_ENABLED`, roles, …) بدون CLI/token: فقط از رفتار HTTP و DB **استنتاج جزئی** — بخش زیادی **STILL UNKNOWN**.
6. **Safe to start cleanup = NO** برای Production و Development تا mutex cron↔engine و envهای Railway تأیید شوند.

---

## Access and Evidence Sources

| Source | Status | What was collected |
|--------|--------|--------------------|
| Vercel CLI (`npx vercel`, account `aistudi777-7459`, team `kiam-studios-projects`) | **Available** | Projects `winway`, `winway-dev`; `env list` + `env pull` for production/preview/(development) |
| Railway CLI / API token | **ACCESS NOT AVAILABLE** (`railway whoami` → Unauthorized; no `~/.railway`) | Only public HTTP probes |
| Railway public HTTP | **Available** | `/health`, `/v1/*` auth probe, CORS OPTIONS |
| Supabase MCP `user-supabase_dev` | **Available** | Project `winway_dev` / ref `yqnptpreowkimopxicfz` — cron, migrations, edge functions, engine lease columns |
| Supabase MCP `user-supabase_clone` | **needsAuth** | Production/clone DB: **ACCESS NOT AVAILABLE** |
| Supabase MCP `user-supabase_DEV_mcp_only` | **needsAuth** | **ACCESS NOT AVAILABLE** |
| Local `.env.local` | Not used as deploy truth | Avoided dumping secrets |

### Project mapping (observed)

| Logical env | Vercel project | Public URL | Railway hostname (from Next env) | Supabase |
|-------------|----------------|------------|----------------------------------|----------|
| Production | `winway` | `https://www.dingmoney.org` | `https://winway-production.up.railway.app` | URL present but **value redacted as `[SENSITIVE]`** by Vercel pull — ref **unknown** from this session |
| Development / Staging | `winway-dev` | `https://dev.dingmoney.org` | `https://winway-dev-production.up.railway.app` | `https://yqnptpreowkimopxicfz.supabase.co` (**CONFIRMED** = MCP target) |

---

## Vercel Environment Matrix

### Legend

- **Flag values** shown for non-secret `NEXT_PUBLIC_*` and hosts.
- Secrets: `present` / `missing` only.
- Engine enabled iff `NEXT_PUBLIC_USE_GAME_ENGINE === "true"` **and** URL non-empty (per `lib/gameEngine/config.ts`).

### A) Vercel project `winway` — Production (`www.dingmoney.org`)

| Variable | Status / value |
|----------|----------------|
| `NEXT_PUBLIC_USE_GAME_ENGINE` | `true` |
| `NEXT_PUBLIC_GAME_ENGINE_URL` | `https://winway-production.up.railway.app` |
| `NEXT_PUBLIC_USE_CARD_POOL_CACHE` | `true` |
| `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE` | `legacy` |
| `NEXT_PUBLIC_SUPABASE_URL` | **present** (Vercel pull returned `[SENSITIVE]` — value not readable here) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **present** |
| `SUPABASE_SERVICE_ROLE_KEY` | **present** |
| `DATABASE_URL` | **present** (pull redacted `[SENSITIVE]`) |
| `MAIN_APP_HOST` | `dingmoney.org` |
| `ADMIN_APP_HOST` | `admin.dingmoney.org` |
| `NEXT_PUBLIC_MAIN_HOST` | **missing** |
| `NEXT_PUBLIC_ADMIN_HOST` | **missing** |
| `NEXT_PUBLIC_MAIN_ORIGIN` | **missing** |
| `NEXT_PUBLIC_ADMIN_ORIGIN` | **missing** (exists on preview target only per `env list`) |

**Derived:**

| Question | Answer |
|----------|--------|
| Engine vs Legacy Next path? | **Engine path active** (flag true + URL set) |
| Active Games? | **`legacy`** |
| Card Pool Cache? | **On** |
| `DATABASE_URL`? | **present** → PG-first path available on server |
| Flag/URL consistent? | **Yes** |
| Prod vs Preview difference? | See preview section — Preview pull incomplete / weaker secrets coverage |

### B) Vercel project `winway` — Preview

| Variable | Status / value (from `env pull --environment=preview`) |
|----------|--------|
| `NEXT_PUBLIC_USE_GAME_ENGINE` | `true` |
| `NEXT_PUBLIC_GAME_ENGINE_URL` | `https://winway-production.up.railway.app` (same Railway as prod) |
| `NEXT_PUBLIC_USE_CARD_POOL_CACHE` | `true` |
| `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE` | `legacy` |
| `NEXT_PUBLIC_SUPABASE_URL` | **missing in pull** (but `env list` shows a preview-targeted entry — **unknown effective value**) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **missing in pull** / list says preview entry exists → **unknown** |
| `SUPABASE_SERVICE_ROLE_KEY` | **missing in pull** / list says preview entry exists → **unknown** |
| `DATABASE_URL` | **present** |
| `ADMIN_APP_HOST` | `admin.dingmoney.org` |
| `MAIN_APP_HOST` | **missing** in pull |

**Note:** Preview pointing at **production Railway** is an isolation risk if preview ever runs with working Supabase credentials.

### C) Vercel project `winway` — Development target

Sparse: only `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE=legacy`, `ADMIN_APP_HOST=admin.dingmoney.org`. Engine flags **missing** on this target. Low practical impact if “Development” target unused for dingmoney traffic.

### D) Vercel project `winway-dev` — Production target (= staging site `dev.dingmoney.org`)

| Variable | Status / value |
|----------|----------------|
| `NEXT_PUBLIC_USE_GAME_ENGINE` | `true` |
| `NEXT_PUBLIC_GAME_ENGINE_URL` | `https://winway-dev-production.up.railway.app` |
| `NEXT_PUBLIC_USE_CARD_POOL_CACHE` | `true` |
| `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE` | `legacy` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://yqnptpreowkimopxicfz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **present** |
| `SUPABASE_SERVICE_ROLE_KEY` | **present** |
| `DATABASE_URL` | **present** (`host=db.yqnptpreowkimopxicfz.supabase.co`) |
| `MAIN_APP_HOST` | `dev.dingmoney.org` |
| `ADMIN_APP_HOST` | `admin.dev.dingmoney.org` |
| `NEXT_PUBLIC_MAIN_HOST` | `dev.dingmoney.org` |
| `NEXT_PUBLIC_ADMIN_HOST` | `admin.dev.dingmoney.org` |
| `NEXT_PUBLIC_MAIN_ORIGIN` | `https://dev.dingmoney.org` |
| `NEXT_PUBLIC_ADMIN_ORIGIN` | `https://admin.dev.dingmoney.org` |

**Derived:** Engine path **on**; Active Games **legacy**; Card pool **on**; PG **present**; Flag/URL **consistent**.

### E) Vercel project `winway-dev` — Preview

Same non-secret flag/URL/host values as winway-dev production pull (engine on, cache on, active games legacy, same Railway + same Supabase ref). Secrets **present**.

### Prod vs Staging (Next) delta

| Dimension | `winway` prod | `winway-dev` staging |
|-----------|---------------|----------------------|
| Engine flag | true | true |
| Engine URL | `winway-production.up.railway.app` | `winway-dev-production.up.railway.app` |
| Card pool cache | true | true |
| Active games | legacy | legacy |
| Host/origin public vars | partial (MAIN/ADMIN host only) | full NEXT_PUBLIC_* set |
| Supabase project | unknown (sensitive) | `yqnptpreowkimopxicfz` |

---

## Railway Runtime Matrix

Railway dashboard env: **ACCESS NOT AVAILABLE** (no CLI auth).  
Evidence below is from **public HTTP** + **DB side-effects on DEV Supabase only**.

### Observed HTTP (both services)

| Probe | Production Railway | Development Railway |
|-------|--------------------|---------------------|
| Base URL | `https://winway-production.up.railway.app` | `https://winway-dev-production.up.railway.app` |
| `GET /health` | `200` `{"ok":true,"service":"game-engine","redis":"up"}` | `200` `{"ok":true,"service":"game-engine","redis":"disabled"}` |
| `GET /v1/lobby` (bad JWT) | `401 invalid token` | `401 invalid token` |
| Implication `GAME_ENGINE_API` | **true** (API mounted; health-only would 404 `/v1`) | **true** |
| CORS `Origin: https://dingmoney.org` | `204` allow | n/a |
| CORS `Origin: https://dev.dingmoney.org` | n/a | `204` allow |
| CORS evil / localhost | `403` (prod evil); DEV `localhost:3000` → `403` | Allowlist **not** `*` |

### Env fields (requested) — status

| Variable | Production Railway | Development Railway |
|----------|--------------------|---------------------|
| `GAME_RUNTIME` | **unknown** (env inaccessible). **Inferred possible `engine`** only if prod DB shows leases — prod DB **ACCESS NOT AVAILABLE** | **unknown** from env. **Behavioral inference: `engine` likely** — DEV rooms have `engine_claimed_at` as recently as 2026-07-31 08:02 UTC and `engine_loop_state` used |
| `GAME_ENGINE_ROLES` | **unknown** | **unknown**; lease activity implies **`room-loop` was running** at claim time; draw_jobs activity does not prove engine vs cron drain |
| `SCHEDULER_ENABLED` | **unknown** | **unknown**; claims imply it was **true** when actors ran |
| `GAME_ENGINE_API` | **true** (observed) | **true** (observed) |
| `GAME_ENGINE_HTTP_PORT` | **unknown** (service reachable on 443) | **unknown** |
| `GAME_ENGINE_CORS_ORIGINS` | **allowlist includes `https://dingmoney.org`**; not `*` | **allowlist includes `https://dev.dingmoney.org`**; not `*`; not localhost |
| `REDIS_URL` / Upstash | Redis **up** at health → **some Redis config present** | Redis **disabled** → REST/URL **absent or unused** |
| `COORDINATION_STRICT` | **unknown** | **unknown** (redis disabled → multi-replica unsafe if scaled) |
| `ENGINE_REPLICA_COUNT` | **unknown** | **unknown** |
| `SUPABASE_URL` / service role | **unknown** (but API verifies JWT → Supabase client configured) | **unknown** from env; must match DEV project for JWT |
| `DATABASE_URL` | **unknown** | **unknown** |
| `ENABLE_SHADOW_PARITY` | **unknown** | **unknown** |
| `ENGINE_ID` | **unknown** | **unknown** |

### Railway conclusions (safe wording)

| Question | Production | Development |
|----------|------------|-------------|
| Runtime legacy/hybrid/engine? | **STILL UNKNOWN** (env). Do not assume. | **Likely `engine` historically** (lease columns) but env not read → treat as **unknown for cleanup gating** |
| Roles running? | **unknown** | **room-loop evidenced**; others unknown |
| Scheduler on? | **unknown** | **likely on when claims occurred**; current idle rooms ≠ proof off |
| API vs health-only? | **API enabled** | **API enabled** |
| Replica count / coordination? | Redis up; replica/strict **unknown** | Redis disabled → **not multi-replica-safe** if >1 replica |
| CORS | Allowlisted (good) | Allowlisted (good) |
| Shadow parity | **unknown** | **unknown** |

---

## Supabase Cron Inventory

### Supabase Development (`yqnptpreowkimopxicfz` / MCP `user-supabase_dev`) — CONFIRMED

| jobid | Name | Active | Schedule | Command | Conflict risk vs Railway | Recommendation (no action taken) |
|------:|------|--------|----------|---------|--------------------------|----------------------------------|
| 1 | `fn_generate_card_pool_step` | **true** | `15 seconds` | `SELECT game_core.fn_generate_card_pool_step()` | Low (pool gen) | Keep unless product says otherwise |
| 6 | `fn_janitor_sweep` | **true** | `* * * * *` | `SELECT game_core.fn_janitor_sweep()` | Partial overlap with engine repair janitor | Docs often keep sweep; confirm ownership |
| 8 | `heartbeat_log_partitions` | **true** | `10 3 * * *` | maintain partitions | None | Keep |
| 9 | `cleanup_retention` | **true** | `30 3 * * *` | `fn_cleanup_retention()` | None | Keep |
| 10 | `bingo_heartbeat` | **true** | `1 second` | `SELECT public.fn_heartbeat_tick();` | **HIGH** vs Railway scheduler/room-loop | Disable only after confirming Railway owns waiting+live clock |
| 11 | `bingo_draw_worker_1` | **true** | `1 second` | `fn_process_draw_jobs_batch_worker(1,3)` | **HIGH** vs draw-processor | Same |
| 12 | `bingo_draw_worker_2` | **true** | `1 second` | worker(2,3) | **HIGH** | Same |
| 13 | `bingo_draw_worker_3` | **true** | `1 second` | worker(3,3) | **HIGH** | Same |

**Absent on DEV:**

- Tournament tick cron (`tournament.fn_tick_due_tournaments`) — **not present** (functions still exist in DB).
- Dev-player / bot HTTP crons — **not present**.
- Edge-function `net.http` crons — **not present**.

**Migration vs reality (DEV):**

- Applied: `game_engine_phase2_disable_heartbeat_cron` (`schema_migrations` version `20260602144811`).
- Applied: `game_engine_phase5_disable_tournament_cron` (`20260605172724`).
- Yet `bingo_heartbeat` **active** → **RESTORE or re-schedule after migration** is the leading explanation (**نیازمند تأیید اپراتور**). Tournament cron absence **matches** phase5.

**Edge functions (DEV):** all ACTIVE Hello stubs (`heartbeat`, `draw-worker`, `generate-card-pool`, `dev-schedule-worker`) — confirmed via `get_edge_function` (template `Hello ${name}`). **Not** game workers.

**Engine lease evidence (DEV):**

- `max(engine_claimed_at) = 2026-07-31 08:02:58+00`
- Current rooms: only `finished`/`cancelled`; no live leases now
- `draw_jobs`: 245 rows `done`; last activity ~2026-07-31 08:06 UTC

### Supabase Production

**ACCESS NOT AVAILABLE** — no authenticated MCP/SQL to production project (prod Supabase URL redacted on Vercel). Cron inventory for prod **cannot** be confirmed in this audit.

---

## Authority Matrix

Interpretation keys: **Next** = browser/Vercel routing; **Railway** = game-engine service; **Cron** = pg_cron.  
“Actual Authority” = who appears to own the capability **right now** given evidence (not desired end-state).

### Development / Staging (`dev.dingmoney.org` + Railway DEV + Supabase `yqnptpreowkimopxicfz`)

| Capability | Vercel / Next | Railway | Supabase Cron | Actual Authority | Conflict |
|------------|---------------|---------|---------------|------------------|----------|
| Lobby snapshot | Engine `/v1/lobby` (flag on) | API serves | — | **Railway API** (with Vercel legacy code path unused while flag on) | Low |
| Join room | Engine `/v1/rooms/join` | API → `fn_system_join_or_create_room` | — | **Railway API** | Low (no cron join) |
| Waiting-room heartbeat | — | **unknown if scheduler role on**; leases prove room-loop ran | **`bingo_heartbeat` ACTIVE** | **Cron currently authoritative for ticks**; engine **also capable** | **CRITICAL** if both drive |
| Live draw loop | — | room-loop evidenced historically | Heartbeat live actions inside `fn_heartbeat_tick` | **Ambiguous / dual-capable** | **CRITICAL** |
| Draw job processing | — | draw-processor **unknown** | **`bingo_draw_worker_*` ACTIVE** | **Cron workers active**; engine may also drain | **CRITICAL** |
| Tournament ticking | — | orchestrator **unknown** | **No tournament cron** | **Likely Railway if role+scheduler on, else stalled** | **HIGH uncertainty** |
| Janitor / repair | — | engine repair only if runtime=engine | **`fn_janitor_sweep` ACTIVE** | **Cron sweep owns full janitor**; engine repair optional | Medium (usually OK) |
| Dev players | — | roles **unknown** | No cron; edge stub | **Unknown / possibly idle** | Medium |

### Production (`www.dingmoney.org` + Railway prod + Supabase prod)

| Capability | Vercel / Next | Railway | Supabase Cron | Actual Authority | Conflict |
|------------|---------------|---------|---------------|------------------|----------|
| Lobby / Join / Live-room / Gameroom client path | **Engine flag on** | API **on** | — | **Railway API for those flows** | Flag/API aligned (**good**) |
| Waiting / live / draws / tournament workers | — | runtime/roles/scheduler **UNKNOWN** | Cron inventory **ACCESS NOT AVAILABLE** | **UNKNOWN** | **Cannot clear Critical dual-drive without prod cron + Railway env** |
| Active Games UI | **legacy** hook path | — | — | **Legacy Next client path** | No engine conflict |
| Card pool cache | **on** | — | card pool step cron? **unknown on prod** | Browser cache + DB definitions | Low |

---

## Conflicts and Misconfigurations

| ID | Severity | Finding |
|----|----------|---------|
| C1 | **CRITICAL** | DEV: `bingo_heartbeat` + `bingo_draw_worker_*` **ACTIVE** while Railway DEV is up, API on, and engine leases occurred **today**. Dual lifecycle risk when rooms go live. |
| C2 | **CRITICAL** (until disproven) | Production Railway + Engine Next flag on, but **prod cron inventory unknown** — cannot certify absence of dual-drive. |
| C3 | **HIGH** | DEV: phase2 heartbeat-disable migration applied, job still active → ops drift / RESTORE. |
| C4 | **HIGH** | Tournament: cron disabled/absent on DEV; Railway tournament role/scheduler **unknown** → tournaments may be **stalled** on staging. |
| C5 | **MEDIUM** | Railway DEV `redis: disabled` while health OK — fine for single replica; **unsafe** if scaled without Redis + `COORDINATION_STRICT`. |
| C6 | **MEDIUM** | `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE=legacy` on deployed Vercel vs code default `orchestrator` / SSOT docs. |
| C7 | **MEDIUM** | `winway` Preview may target **prod Railway**; Supabase preview values not materialized in pull. |
| C8 | **LOW–MED** | Missing `NEXT_PUBLIC_*_ORIGIN/HOST` on prod `winway` (defaults in code may still work). |
| C9 | **INFO** | Edge functions Hello stubs — not driving game; docs claiming real edge workers are outdated. |

**Checked Critical patterns from prompt:**

| Pattern | DEV | PROD |
|---------|-----|------|
| Engine + pg_cron same lifecycle | **YES risk (C1)** | **UNKNOWN (C2)** |
| Engine flag on but Railway API off | **No** (API on) | **No** (API on) |
| Engine flag on but URL empty/wrong | **No** | **No** |
| Multi-replica without Redis | **unknown replicas**; redis disabled | redis up; replicas unknown |
| `GAME_RUNTIME=engine` but heartbeat/draw cron on | Runtime not read; **behaviorally plausible + cron on** | Runtime + cron both unknown |
| `legacy_db` but crons missing | Not indicated | Unknown |
| Scheduler on without roles | Unknown | Unknown |

---

## Comparison with Repository Audit

| Topic | Prior audit (`feature-flags-legacy-paths-audit.md`) | This deployment audit | Status |
|-------|-----------------------------------------------------|----------------------|--------|
| 1. `NEXT_PUBLIC_USE_GAME_ENGINE` prod | UNKNOWN / README default false | **Vercel prod+staging = `true`** | **CONTRADICTED** (vs README default); prior UNKNOWN → now **CONFIRMED true** |
| 2. `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE` | Code default orchestrator; comments stale | **Vercel = `legacy`** | **CONFIRMED legacy in deploy**; code default **OUTDATED** vs prod intent |
| 3. `GAME_RUNTIME` | Documented; prod unknown | Env still unread; DEV leases suggest engine path used | **STILL UNKNOWN** (env); **behavioral hint on DEV** |
| 4. `SCHEDULER_ENABLED` | Default false in examples | Not readable; DEV leases imply was true | **STILL UNKNOWN** |
| 5. Railway roles | Unknown | Not readable; room-loop evidenced on DEV | **STILL UNKNOWN** (partial inference) |
| 6. `bingo_heartbeat` on DEV | Suspected active | **CONFIRMED active** | **CONFIRMED** |
| 7. `bingo_draw_worker_*` on DEV | Suspected active | **CONFIRMED active** | **CONFIRMED** |
| 8. Heartbeat vs phase2 migration | Flagged anomaly | Migration **applied** + job **active** | **CONFIRMED anomaly** → likely RESTORE/recreate |
| 9. Tournament authority | Uncertain | Cron absent; engine role unknown | **STILL UNKNOWN** / **HIGH risk stalled** |
| 10. Edge Hello stubs | Suspected | **CONFIRMED** Hello template bodies | **CONFIRMED** |
| Card pool flag default off in README | Documented | Deploy **`true`** | **OUTDATED DOCUMENTATION** |
| Engine API / CORS unknown | Listed UNKNOWN | API **on**; CORS allowlisted | **CONFIRMED** (HTTP) |
| Upstash on Next | Unused in app | Vercel: Redis vars **missing** on pulled envs | **CONFIRMED** unused on Vercel |
| Dual paths still in code | Yes | Deploy chooses engine client path | **CONFIRMED** code dual-path still matters for rollback |

---

## Canonical Path by Environment

### Production

```text
Production:
Next path = ENGINE (NEXT_PUBLIC_USE_GAME_ENGINE=true → https://winway-production.up.railway.app)
Game runtime = UNKNOWN (Railway env ACCESS NOT AVAILABLE)
Scheduler authority = UNKNOWN (Railway) + Supabase prod cron ACCESS NOT AVAILABLE
Draw authority = UNKNOWN (same)
Tournament authority = UNKNOWN (same)
Active Games = legacy
Card Pool Cache = on
Safe to start cleanup = NO
```

**Blockers before cleanup:** (1) Read Railway prod env (`GAME_RUNTIME`, `SCHEDULER_ENABLED`, `GAME_ENGINE_ROLES`, Redis/replicas). (2) Read-only prod `cron.job` inventory. (3) Prove no dual-drive. Do **not** delete legacy Next/DB paths while rollback may be required.

### Development / Staging

```text
Development:
Next path = ENGINE (true → https://winway-dev-production.up.railway.app)
Game runtime = UNKNOWN from env; BEHAVIORAL HINT = engine room-loop used (leases today)
Scheduler authority = CONFLICT RISK — pg_cron bingo_heartbeat ACTIVE + Railway capable
Draw authority = CONFLICT RISK — bingo_draw_worker_1..3 ACTIVE + Railway may also drain
Tournament authority = cron ABSENT; Railway orchestrator UNKNOWN (possible stall)
Active Games = legacy
Card Pool Cache = on
Redis on Railway = disabled
Safe to start cleanup = NO
```

**Conflicts to resolve first (still no changes in this phase):**

1. Decide single owner for waiting/live clock on DEV: **either** keep `bingo_heartbeat` **or** Railway scheduler/room-loop — not both.  
2. Same for draw drain: cron workers **xor** engine draw-processor.  
3. Confirm tournament owner (engine role vs restore cron).  
4. Export Railway DEV env for the matrix fields still marked unknown.

---

## Unknowns Requiring Manual Verification

1. Railway Production & Development dashboard values for: `GAME_RUNTIME`, `GAME_ENGINE_ROLES`, `SCHEDULER_ENABLED`, `COORDINATION_STRICT`, `ENGINE_REPLICA_COUNT`, `ENABLE_SHADOW_PARITY`, `ENGINE_ID`, `DATABASE_URL` presence, Supabase URL pairing.  
2. Supabase **Production** `cron.job` full inventory (and whether it matches engine ownership).  
3. Which Supabase project ref Production Vercel uses (URL was `[SENSITIVE]`).  
4. Whether `winway` Preview deployments actually receive Supabase keys at runtime.  
5. Whether Railway DEV currently has `SCHEDULER_ENABLED=true` **right now** (leases prove past activity, not current config).  
6. Tournament progression on staging in the last 7 days (ops/product check).  
7. Replica count on Railway prod given redis=up.  
8. Operator history: who/what re-enabled `bingo_heartbeat` after phase2 migration on DEV.

---

## Recommended Next Action

1. **Do not start cleanup waves** from the feature-flag audit yet (`Safe to start cleanup = NO`).  
2. Manually fill Railway env matrices (screenshot or read-only `railway variables`) for prod + dev.  
3. Open read-only SQL on **production** Supabase for `SELECT jobid, jobname, schedule, active, command FROM cron.job ORDER BY 1`.  
4. On **DEV only**, after human decision, plan a **mutex** change in a later approved phase (disable cron **xor** stop engine workers) — **not in this audit**.  
5. Update docs/README defaults to match deploy reality (`USE_GAME_ENGINE=true`, card pool true, active games legacy) once product confirms intent.  
6. Keep legacy code paths until Production cron↔runtime mutex is proven clean.

---

## Appendix — Evidence timestamps

| Evidence | When / note |
|----------|-------------|
| Vercel env pulls | 2026-07-31 (this session) |
| Railway `/health` + `/v1` + CORS | 2026-07-31 (this session) |
| DEV `cron.job` query | 2026-07-31 via MCP |
| DEV `engine_claimed_at` max | 2026-07-31 08:02:58+00 |
| DEV edge Hello stubs | Confirmed via `get_edge_function` |
| Temp pulled env files | Created under `tmp/vercel-*.env` during audit; **should be deleted locally** and must not be committed |

---

## Explicit non-actions

This audit did **not** change environment variables, cron jobs, migrations, Railway/Vercel settings, application code (except creating this report file), or create git commits.
