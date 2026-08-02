# DEV Runtime Authority Decision

> **Date:** 2026-07-31  
> **Scope:** Development / Staging only (`dev.dingmoney.org` + Railway `winway-dev-production` + Supabase `yqnptpreowkimopxicfz`)  
> **Mode:** Decision / plan only — no env, cron, SQL, migration, or runtime changes applied.  
> **Inputs:**  
> - `docs/audits/feature-flags-legacy-paths-audit.md`  
> - `docs/audits/deployment-runtime-state-audit.md`  
> - Railway DEV values supplied by operator (this session)
>
> ## Superseded note (mutex applied — 2026-07-31)
>
> Tables below that list `bingo_heartbeat` / `bingo_draw_worker_*` as **ACTIVE**
> describe the **pre-mutex** conflict. Those crons were later **unscheduled** on
> `yqnptpreowkimopxicfz` (`docs/runbooks/dev-game-cron-mutex-apply.md`). Railway
> remains the intended game runtime owner; hybrid/`legacy_db` code paths stay for
> rollback and must **not** be described as deleted.

---

## Railway DEV Configuration

| Variable | Operator-provided value | Gate result |
|----------|-------------------------|-------------|
| `GAME_RUNTIME` | `engine` | **Pass** — TS owns waiting promote + live actor path |
| `SCHEDULER_ENABLED` | `true` | **Pass** — tick workers start |
| `GAME_ENGINE_ROLES` | `scheduler,draw-processor,tournament-orchestrator,room-loop,dev-player-scheduler,dev-player-processor` | **Pass** — all lifecycle roles present |
| `ENGINE_REPLICA_COUNT` | `1` | **Pass** — single replica |
| `COORDINATION_STRICT` | `false` | Acceptable with replica count `1` |
| Redis (observed earlier) | `/health` → `redis: disabled` | Acceptable with **1 replica**; do not scale out until Redis + `COORDINATION_STRICT=true` |

**Prerequisite checklist (from prompt):**

```text
GAME_RUNTIME=engine                         ✅
SCHEDULER_ENABLED=true                      ✅
GAME_ENGINE_ROLES includes required roles   ✅ (scheduler + draw-processor + room-loop + tournament + dev-player)
ENGINE_REPLICA_COUNT=1 or Redis/coord safe  ✅ (replica=1)
```

→ Conditions met to propose **Railway as canonical owner** and design a **separate DEV-only mutex migration** for overlapping crons.  
→ This document does **not** execute that migration.

---

## Workers That Actually Start

With `SCHEDULER_ENABLED=true` and the roles above, `game-engine` starts these workers (`apps/game-engine/src/index.ts` + role handlers). Behavior under `GAME_RUNTIME=engine`:

| Role | Starts? | What it owns in `engine` mode | Idle / alternate modes |
|------|---------|-------------------------------|------------------------|
| `scheduler` | **Yes** | `manageWaitingRooms` (waiting → playing); nested `fn_janitor_repair_unsettled_finished` | Does **not** insert live draws |
| `room-loop` | **Yes** | Claims playing rooms; `runOneDrawCycle` owns live draw clock | Idle only if `legacy_db` |
| `draw-processor` | **Yes** | Per-room actor drain (default); recovery for `draw_jobs`; skips actor-owned playing rooms per runbook | Idle if `legacy_db` |
| `tournament-orchestrator` | **Yes** | `tickDueTournamentsEngine` (TS select + `fn_tick_tournament`) | Idle if `legacy_db` |
| `dev-player-scheduler` | **Yes** | Independent of runtime; schedules bot joins | — |
| `dev-player-processor` | **Yes** | Independent of runtime; processes bot join jobs | — |

**Verdict — is Railway DEV the intended owner?**

| Capability | Railway owns it under this config? | Evidence |
|------------|------------------------------------|----------|
| Waiting-room heartbeat / promote | **Yes (intended)** | `scheduler` + `manageWaitingRooms` |
| Live room draw loop | **Yes (intended)** | `room-loop` + `runOneDrawCycle` |
| Draw job processing | **Yes (intended)** | `draw-processor` |
| Tournament ticking | **Yes (sole path)** | orchestrator on; tournament cron absent |
| Janitor repair (unsettled finish) | **Yes (partial)** | scheduler nested repair RPC |
| Dev-player workers | **Yes (sole path)** | both roles on; no cron |

**Caveat:** “Intended owner” ≠ “exclusive owner” while overlapping crons remain active. Deployment audit already showed `engine_claimed_at` activity **and** active `bingo_*` crons on the same DEV DB → **dual capability today**.

---

## Supabase Cron Ownership

Confirmed active on DEV (`deployment-runtime-state-audit.md`):

| Cron | Active | Target | Overlaps Railway? |
|------|--------|--------|-------------------|
| `bingo_heartbeat` | **true** | `fn_heartbeat_tick()` → waiting **and** live actions | **Yes** — vs `scheduler` + `room-loop` |
| `bingo_draw_worker_1..3` | **true** | `fn_process_draw_jobs_batch_worker(n,3)` | **Yes** — vs `draw-processor` |
| `fn_janitor_sweep` | **true** | Full `game_core.fn_janitor_sweep()` | **Partial** — broader than engine repair |
| `fn_generate_card_pool_step` | true | Card pool generation | No game-clock conflict |
| `heartbeat_log_partitions` / `cleanup_retention` | true | Maintenance | No |
| Tournament tick cron | **false / absent** | — | No conflict |
| Dev-player / edge HTTP crons | **absent** | Edge Hello stubs only | No conflict |

**Historical note:** Migration `game_engine_phase2_disable_heartbeat_cron` was applied on DEV, yet `bingo_heartbeat` is active again → RESTORE or re-schedule after migration. Any new mutex migration must be **idempotent** and verified post-apply.

---

## Overlap Matrix

| Capability | Railway Worker | Railway Active? | Supabase Cron | Cron Active? | Conflict | Canonical Owner |
|------------|----------------|----------------:|---------------|-------------:|----------|-----------------|
| Waiting room lifecycle | `scheduler` → `manageWaitingRooms` | **Yes** | `bingo_heartbeat` | **true** | **YES** — both can promote / manage waiting | **Railway `scheduler`** |
| Live draw loop | `room-loop` → `runOneDrawCycle` | **Yes** | `bingo_heartbeat` (`fn_manage_room_live_actions` via tick) | **true** | **YES** — dual clock / double insert risk | **Railway `room-loop`** |
| Draw job processing | `draw-processor` | **Yes** | `bingo_draw_worker_1..3` | **true** | **YES** — dual drain of `draw_jobs` | **Railway `draw-processor`** |
| Tournament ticking | `tournament-orchestrator` | **Yes** | none | **false** | **No** | **Railway `tournament-orchestrator`** |
| Janitor | `scheduler` → `fn_janitor_repair_unsettled_finished` | **Yes** (repair only) | `fn_janitor_sweep` | **true** | **Low / complementary** — sweep ≠ repair-only | **Keep cron sweep**; Railway keeps repair |
| Dev players | `dev-player-scheduler` + `dev-player-processor` | **Yes** | none | **false** | **No** | **Railway dev-player roles** |

---

## Double-Drive Risks

| Risk | Severity | Mechanism |
|------|----------|-----------|
| Waiting promote twice / race | **Critical** | Cron `fn_heartbeat_tick` + engine `manageWaitingRooms` |
| Live draws double-inserted or desynced clock | **Critical** | Cron live half + `room-loop` actor |
| `draw_jobs` processed by cron **and** engine | **Critical** | Workers 1–3 ignore actor ownership filters that engine uses for playing rooms |
| Settlement / marks races | **High** | Competing evaluate/finalize paths |
| Tournament double-tick | **None on DEV** | Cron absent |
| Janitor double-repair | **Low** | Different RPCs; sweep is broader cleanup |
| Dev-player double join | **None on DEV** | No competing cron |

Until mutex is applied, DEV must be treated as **unsafe for authoritative soak tests** that assume single owner.

---

## Recommended Canonical Authority

**For DEV only, after mutex migration (not yet applied):**

| Capability | Canonical owner | Rationale |
|------------|-----------------|-----------|
| Waiting-room lifecycle | Railway `scheduler` | Config is `engine` + role present; ADR/runbook |
| Live draw loop | Railway `room-loop` | Actor-only path (`ADR 0001`) |
| Draw job processing / recovery | Railway `draw-processor` | Engine drain + actor filter |
| Tournament ticking | Railway `tournament-orchestrator` | Already sole path on DEV |
| Full janitor sweep | Supabase `fn_janitor_sweep` cron | Keep — broader than engine repair; docs/runbooks keep it in engine mode |
| Unsettled-finish repair | Railway nested janitor | Complements sweep |
| Dev players | Railway dev-player roles | Already sole path |
| Card pool step / retention / partitions | Existing non-game crons | Unchanged |

**Do not** propose disabling `fn_janitor_sweep`, card-pool step, or retention jobs as part of lifecycle mutex.

---

## Exact Change Plan

> **Not executed in this phase.** Design only for a later approved DEV migration.

### 1) Cron jobs to disable (DEV mutex)

| Job | Action | Why |
|-----|--------|-----|
| `bingo_heartbeat` | **Disable** (`cron.unschedule` by `jobname`) | Conflicts with `scheduler` + `room-loop` |
| `bingo_draw_worker_1` | **Disable** | Conflicts with `draw-processor` |
| `bingo_draw_worker_2` | **Disable** | Same |
| `bingo_draw_worker_3` | **Disable** | Same |

### 2) Cron jobs to keep

| Job | Keep? | Why |
|-----|-------|-----|
| `fn_janitor_sweep` | **Yes** | Full sweep; engine only runs repair RPC |
| `fn_generate_card_pool_step` | **Yes** | Unrelated to game clock |
| `heartbeat_log_partitions` | **Yes** | Maintenance |
| `cleanup_retention` | **Yes** | Maintenance |
| Tournament tick | Already absent | Leave absent; Railway owns |
| Dev / edge HTTP crons | Already absent | Leave absent |

### 3) `fn_janitor_sweep`

**Remain active.** Engine’s `fn_janitor_repair_unsettled_finished` is a narrow repair; sweep covers broader janitor duties. No mutex conflict at Critical level.

### 4) Tournament

No cron change. Ensure Railway keeps `tournament-orchestrator` in `GAME_ENGINE_ROLES` and `SCHEDULER_ENABLED=true`. Verify tick advances due tournaments in Verification Plan §9.

### 5) New SQL / Migration (DEV-targeted)

Propose a **new** idempotent migration (name illustrative):

```text
sql/migrations/YYYYMMDDHHMMSS_dev_mutex_disable_bingo_heartbeat_and_draw_workers.sql
```

Contents (conceptual — do not apply now):

1. `SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bingo_heartbeat';`
2. `SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('bingo_draw_worker_1','bingo_draw_worker_2','bingo_draw_worker_3');`
3. Optional verify comment: `SELECT jobname, active FROM cron.job WHERE jobname LIKE 'bingo_%';`

Notes:

- Mirror intent of `scripts/game-engine-cron-heartbeat.sql` DISABLE + `scripts/game-engine-cron-draw-workers.sql` DISABLE.
- **Do not** include uncommented RESTORE `cron.schedule` blocks in the migration file (footgun called out in prior audit).
- Apply **only** to Supabase DEV (`yqnptpreowkimopxicfz`) until Production inventory + Railway prod env are separately decided.
- Phase2 already tried heartbeat disable on DEV and drifted — pair migration with a post-apply verification checklist and optionally a short ops note in runbooks.

### 6) Apply order (future execution)

1. Confirm Railway DEV still matches this decision matrix (env unchanged unintentionally).  
2. Confirm `ENGINE_REPLICA_COUNT=1` and no second engine process against DEV DB.  
3. Quiet period: no live rooms (or drain existing).  
4. Apply DEV mutex migration (heartbeat + draw workers only).  
5. Verify `cron.job`: those four jobs gone/inactive; `fn_janitor_sweep` still active.  
6. Confirm Railway workers still running (`SCHEDULER_ENABLED=true`).  
7. Run Verification Plan below.  
8. Only after soak: consider Production decision (separate doc — **out of scope**).

### 7) What not to change in that phase

- No Railway env flips.  
- No Vercel flag changes.  
- No drop of RPC functions (heartbeat/draw workers remain callable for rollback).  
- No deletion of legacy Next paths.  
- No Production cron changes.

---

## Verification Plan

After a future mutex apply (and smokeable before apply for baseline):

| # | Scenario | Pass criteria |
|---|----------|---------------|
| 1 | Create lobby / open lobby | Lobby loads via ENGINE path; room groups correct |
| 2 | Two users join | Cards issued; wallet debit once each; no duplicate tickets |
| 3 | Start game | Waiting → playing via engine `manageWaitingRooms` only; no competing cron promote |
| 4 | Sequential draws | Draws advance on actor cadence; `engine_owner_id` / lease healthy while playing |
| 5 | Game end | Room finishes; winners recorded |
| 6 | Settlement | `fn_finish_room_and_settle` (or engine-triggered settle) once; balances match audit |
| 7 | No duplicate draw | No double `draws` rows for same sequence; no crossed numbers |
| 8 | No double wallet debit | Join idempotency; settle once; wallet ledger unique |
| 9 | Tournament tick | Due tournament advances without cron; orchestrator logs clean |
| 10 | Railway restart | Service comes back; `/health` ok; workers resume; no stuck `processing` jobs beyond reap window |
| 11 | Lease recovery | Kill mid-game or expire lease → another claim or recovery; game continues without dual clock |
| 12 | Cron after change | `bingo_heartbeat` and `bingo_draw_worker_*` **absent/inactive**; `fn_janitor_sweep` **active**; no accidental RESTORE |

**Observability:** engine logs (`[Scheduler]`, `[RoomLoop]`, `[Janitor]`, draw-processor); DB views `v_draw_latency_slo`, `v_engine_loop_health` if present; wallet before/after snapshots.

---

## Rollback Plan

If verification fails after mutex migration:

1. **Stop or idle Railway game workers** first (`SCHEDULER_ENABLED=false` **or** remove draw/scheduler/room-loop roles) — avoid dual-drive during restore.  
2. **RESTORE crons** using commented RESTORE sections of:  
   - `scripts/game-engine-cron-heartbeat.sql`  
   - `scripts/game-engine-cron-draw-workers.sql`  
   (run RESTORE deliberately; do not re-run whole draw-worker file blindly if DISABLE+RESTORE both executable).  
3. Verify `bingo_heartbeat` + `bingo_draw_worker_1..3` active.  
4. Confirm rooms progress under DB authority.  
5. Optionally set `GAME_RUNTIME=legacy_db` for full idle of engine workers (ops decision).  
6. File incident note: why mutex failed before retrying.

RPC implementations stay in DB; rollback is **schedule ownership**, not schema drop.

---

## Go / No-Go Decision

```text
GO — آماده طراحی Migration mutex هستیم
```

**Why GO:**

- Railway DEV config is complete and matches engine-canonical requirements (`GAME_RUNTIME=engine`, `SCHEDULER_ENABLED=true`, required roles present, `ENGINE_REPLICA_COUNT=1`).  
- Overlap with `bingo_heartbeat` and `bingo_draw_worker_*` is **confirmed Critical**.  
- Tournament and dev-player already have no competing cron.  
- `fn_janitor_sweep` should stay; not a blocker.

**Still out of scope for this GO:** applying the migration, changing Production, or removing legacy application code. Next approved step = draft/review the DEV-only mutex migration SQL, then human-approved apply + verification.
