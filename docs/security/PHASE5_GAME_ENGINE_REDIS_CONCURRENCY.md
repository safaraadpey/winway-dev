# Phase 5 — Game Engine, Redis, Concurrency & Settlement (Read-Only)

**Platform:** Ding Money (winway)  
**Phase:** 5 — Game engine authority, coordination, and settlement safety  
**Date:** 2026-07-21  
**Status:** Read-only; no code, config, or data changes.

**Sources:** `game-engine/` (Railway workers + optional HTTP API), PostgreSQL RPCs in `supabase/schema.sql` and `winway/sql/migrations/`, player paths in `services/`, `app/api/`.  
**Related:** [Phase 1](./PHASE1_ARCHITECTURE_ATTACK_SURFACE_AUDIT.md) · [Phase 2](./PHASE2_SECRETS_INFRA_DEPLOYMENT.md) · [Phase 3](./PHASE3_AUTH_RLS_AUTHORIZATION.md) · [Phase 4](./PHASE4_WALLET_DING_FINANCIAL.md)

---

## 1. Executive summary

The **authoritative game loop** is intended to run on the **game engine** (when `GAME_RUNTIME=engine`) or legacy **PostgreSQL** (`fn_heartbeat_tick`, `fn_manage_room_live_actions`) when `GAME_RUNTIME=hybrid` / `legacy_db`. **Draw numbers, marks, winners, and settlement** are computed **server-side** from `room_seed` and ticket/card data. The browser **must not** submit draw results, marks, or payouts.

**Redis (Upstash / ioredis)** is used only for **coordination** (leader locks, per-room draw-processor locks, engine heartbeat)—**not** for balances or game truth.

**Main residual risks** are not “client picks the winning number,” but:

1. **Dual runtime paths** (room-loop actor vs draw-processor queue vs legacy DB cron) and **multi-replica** behavior when Redis is missing or degraded.  
2. **PostgREST exposure** of `rpc_pick_draw_jobs`, `fn_heartbeat_tick`, etc. (Phase 3)—outside the engine but affecting the same tables.  
3. **Settlement after finalize** is a **second step** (`fn_finish_room_and_settle`); retries and janitor exist, but a failed settlement leaves **draw finalized, room not finished** until repair.  
4. **Client-trusted inputs** on join: `cardCount`, `templateId`, optional **room password**—not stake price.

---

## 2. Runtime modes (`GAME_RUNTIME`)

| Mode | Who drives draws | Who promotes waiting→playing | Engine draw-processor |
|------|------------------|------------------------------|------------------------|
| `legacy_db` | DB cron / `fn_heartbeat_tick` | DB (via cron) | **Idle** (logs “cron owns draws”) |
| `hybrid` | DB via `fn_heartbeat_tick` from engine scheduler | Same RPC | May still run for `draw_jobs` backlog |
| `engine` | **Room-loop actor** (`runOneDrawCycle`) + optional **draw-processor** for non-actor rooms | `manageWaitingRooms` in TS | Picks `draw_jobs`; **filters out** `playing` actor-owned rooms |

Configured in `game-engine/src/config/env.ts`; roles via `GAME_ENGINE_ROLES` (comma-separated: `scheduler`, `draw-processor`, `room-loop`, …).

---

## 3. What the client controls (trust boundary)

| Input | Source | Server enforcement |
|-------|--------|-------------------|
| **User identity** | Supabase JWT | Engine HTTP: `verifyUser(token)` — **ignores body user id** (`http/auth.ts`). Join RPC uses `auth.uid()` or `fn_system_join_or_create_room(p_user_id=verified)`. |
| **templateId / roomId** | Client query/body | Must exist; template price, limits from DB. |
| **cardCount** | Client | Capped by `max_cards_per_player`; each card → server-priced hold. |
| **room password** | Client | Compared to template password in `fn_join_or_create_room_core`. |
| **Draw number** | — | **Not client-supplied** in engine path; from `pickNextNumber(seed, drawn)` (`core/rng.ts`). |
| **Marks / winners** | — | Engine evaluates in memory; persists via `rpc_finalize_engine_draw_job` (marks/results JSON **produced by engine**, not browser). |
| **Stake / ticket price** | — | From `room_templates` / `rooms.card_price`. |
| **Settlement / payout** | — | `settleRoomIfNeeded` → `fn_finish_room_and_settle` (service role only). |
| **Optimistic Ding UI** | Client display | `creditDingOnReveal` — **does not write DB** (Phase 4). |

**Malicious client cannot** (via supported APIs alone): choose the next ball, insert arbitrary `results`, or call engine finalize without service role. **Can** (within rules): spam join with max cards, probe room IDs on snapshots, and **if PostgREST grants allow**, invoke dangerous DB RPCs directly (Phase 3)—that is an **authz** issue, not engine logic.

---

## 4. Room lifecycle (authoritative)

```text
waiting → (min players / scheduler) → playing → (line/full winner or exhausted)
  → settling → finished
```

| Stage | Primary owner (engine runtime) | Key RPC / code |
|-------|--------------------------------|----------------|
| Create / waiting | Join RPC creates or attaches to waiting room | `fn_join_or_create_room` / `fn_system_join_or_create_room` |
| Start (`playing`) | Room scheduler | `manageWaitingRooms` (`domain/room/`) |
| Draw clock | **Room-loop** lease owner | `rpc_claim_game_room`, `rpc_insert_draw_if_ready_owner_guard` |
| Per-draw processing | Actor inline or draw-processor | `processEngineDrawJob`, `rpc_finalize_engine_draw_job` |
| Settlement | Engine after full win | `settleRoomIfNeeded` → `fn_finish_room_and_settle` |
| Cancel waiting | Player/admin RPC | `fn_cancel_waiting_room` → release holds (Phase 3/4) |
| Janitor | Room scheduler tick | `repairUnsettledFinishedRooms` |

**Reconnect:** Client refreshes snapshots (`/api/player/live-room`, gameroom, Realtime). **No client-triggered settlement.** Wallet sync polls after game end (`scheduleWalletBalanceSync`).

**Disconnect:** In-flight draws continue on server; lease renewal stops if actor process dies → lease expires → another replica may claim (see §7).

---

## 5. Draw / RNG authority

1. **Seed:** `room_seed` (bytes) + published `room_seed_hash` at room creation (`fn_generate_room_seed`).  
2. **Next number:** Lowest SHA-256 ordering key among undrawn 1..90 — ported in TS as `pickNextNumber` (`core/rng.ts`), matching SQL in `fn_manage_room_live_actions` / join card ordering.  
3. **Insert draw:** Owner-guarded RPC only when lease + status + due time OK (`insertDrawIfReadyForOwner` → `rpc_insert_draw_if_ready_owner_guard`). Outcomes: `inserted`, `duplicate`, `backpressure`, `not_owner`, `not_playing`, `exhausted`.  
4. **Evaluate:** `applyMarksAndEvaluateWithState` — line/full detection from ticket grids + drawn set.  
5. **Persist:** Single RPC bundles marks, results, job completion, `processed_at`, ding credits (`rpc_finalize_engine_draw_job`).

**Client manipulation of draw/RNG:** Not supported on engine path. **Integrity concern:** leaking `room_seed` (Phase 3 `room-results` API) allows **predicting** future numbers, not **changing** them.

---

## 6. Winner determination & settlement

| Step | Atomic? | Idempotent? | Notes |
|------|---------|-------------|-------|
| Insert `results` | In finalize RPC | `ON CONFLICT (ticket_id, win_type) DO NOTHING` | Engine-supplied rows |
| Mark `draws.processed_at` | Same RPC | Gated on job/draw state | Ding requires processed draw |
| Ding credit | `rpc_apply_ding_credits_for_draw` | Unique indexes + `ding_aggregated_at` | Service role only |
| Room → `settling` | `setRoomSettling` | Status transition | Before settle RPC |
| `fn_finish_room_and_settle` | Single PL/pgSQL txn | **Returns early if `finished`** | Capture holds, pay winners, commission distribute |
| Retry settle | `settleRoomIfNeeded` 3× with backoff | Safe if room already finished | Logs error if finalize ok but settle fails |

**Duplicate payout:** Mitigated by `paid_at` on `results`, room `finished` guard, and wallet deltas tied to settlement pass. **Risk:** two concurrent `settleRoomIfNeeded` calls could both pass `roomNeedsSettlement` before status flip—mitigated if `setRoomSettling` uses conditional update (verify live RPC).

**Partial settlement:** Documented in engine logs: *“settlement failed (draw already finalized)”* — financial state may lag until janitor/retry.

---

## 7. Redis / Upstash usage

### 7.1 Key namespaces

| Key pattern | Purpose | TTL (typical env default) |
|-------------|---------|----------------------------|
| `ding:game-engine:v2:lock:worker:draw-picker` | One picker at a time per cluster | `DRAW_PROCESSOR_LOCK_TTL_SEC` **30s** |
| `ding:game-engine:v2:lock:worker:scheduler` | Room scheduler leader | `SCHEDULER_LOCK_TTL_SEC` |
| `ding:game-engine:v2:lock:worker:tournament` | Tournament orchestrator | `TOURNAMENT_LOCK_TTL_SEC` |
| `ding:game-engine:v2:lock:worker:dev-player-*` | Dev synthetic players | role-specific TTL |
| `{prefix}:draw:room:{roomId}` (via `redis/keys.ts`) | Per-room draw job processing | `DRAW_ROOM_LOCK_TTL_SEC` **120s** |
| `ding:game-engine:v2:engine:{engineId}` | Engine registry heartbeat | `ENGINE_HEARTBEAT_TTL_SEC` |

**Lock primitives:** `SET key token EX ttl NX`; release/renew via Lua compare token (`redis/client.ts` — ioredis + Upstash REST).

### 7.2 Acquisition / release / ownership

| Component | Acquire | Release | Ownership |
|-----------|---------|---------|-----------|
| **pickCoordinator** | `acquireLeaderLockWithTimeout` (2s cap) | After `rpc_pick_draw_jobs` returns | Token UUID per coordinator instance |
| **draw-processor (legacy batch)** | Same picker lock during pick | Before processing batch | Same |
| **room-scheduler** | Scheduler leader lock per tick | `finally` release | Token per worker |
| **RoomDrawActor** | Per-room lock for each job | After `processEngineDrawJob` | Requeue job if lock miss |
| **processJobsByRoom** | Optional per-room lock for whole queue | `finally` release | On miss → requeue all jobs in room |
| **Room lease (Postgres)** | `rpc_claim_game_room` | `rpc_release_game_room` | `engine_owner_id` + **`engine_lease_epoch`** |

**Renewable locks:** `RenewableWorkerLock` extends TTL on interval (`renewableLock.ts`) — used where long-held global locks exist.

### 7.3 Degraded / no Redis

From `leaderLock.ts`:

- **No Redis + single replica:** Proceed **without** lock (`proceed: true, lockHeld: false`) — acceptable for dev.  
- **No Redis + `coordinationStrict` or `engineReplicaCount > 1`:** **Fail closed** (`proceed: false`) for locked workers.  
- **Redis error:** Warn once, **degraded single-instance mode** (may proceed without lock) unless fail-closed.

**Impact:** Multiple Railway replicas without working Redis can **both pick draw jobs** or **both run scheduler ticks**—DB `SKIP LOCKED` reduces duplicate job rows but **does not** replace room lease for actor inserts.

### 7.4 Stale locks & TTL expiry

| Scenario | Behavior |
|----------|----------|
| Picker lock TTL (30s) | Lock held only during **pick RPC**, not full draw processing — short exposure |
| Room processor lock (120s) | If processing exceeds TTL, another replica may acquire lock and requeue/process — **finalize idempotency** (`processed_at`, conflict constraints) limits double marks/ding |
| Stale `draw_jobs` in `processing` | `reapStaleDrawJobs` requeues after `DRAW_JOB_STALE_SEC` (default **120s**), evicts room state cache |
| Lease expiry mid-actor | `rpc_finalize_engine_draw_job` returns **-1** (fenced); actor exits as `not_owner` |

**Lock expiration during long mutation:** Possible for **slow** finalize/settle; fencing + idempotent DB writes are the safety net.

---

## 8. Draw processor architecture (recent)

### 8.1 Components

| Piece | Role |
|-------|------|
| **pickCoordinator** | Wake-driven pick loop; Redis picker lock; calls `pickDrawJobs`; dispatches to **RoomDrawActorPool** |
| **adaptivePollScheduler** | Backoff when idle / `lockDeferred`; fast reset on Realtime/enqueue wake |
| **pickPollBackoff / telemetry** | Local timer only; tracks `lockDeferredCount` |
| **lockDeferred** | Another replica holds picker lock → no RPC pick this cycle; backoff |
| **RoomDrawActorPool / RoomDrawActor** | **One serial queue per room** for picked jobs |
| **filterActorOwnedDrawJobs** | Skips/requeues jobs for `status=playing` rooms (actor owns live draws) |
| **startPerRoomActorProcessor** | Wires coordinator + pool when `DRAW_PROCESSOR_PER_ROOM_ACTOR` (default **on**) |
| **Legacy path** | `processDrawBatchEngine` in `draw-processor/index.ts` when per-room actor off |

### 8.2 Queue processing

1. Trigger inserts `draw_jobs` (trigger on `draws` — DB side).  
2. `game_core.rpc_pick_draw_jobs`: `FOR UPDATE SKIP LOCKED` → status `processing`.  
3. Engine processes jobs **lowest `draw_number` first per room**.  
4. `processEngineDrawJob`: evaluate → `finalizeEngineDrawJob` → optional `settleRoomIfNeeded`.  
5. Failures: increment attempts, requeue or dead-letter (`DRAW_PROCESSOR_MAX_ATTEMPTS` default **10**).

**Duplicate workers same game:**

- **Actor path:** Only lease owner inserts draws; draw-processor **requeues** actor-room jobs unless draw already processed.  
- **Two processors same job:** Prevented by job status + skip if `processed_at` set.  
- **Actor + legacy DB hybrid misconfig:** Could double-drive — **operational** risk if `GAME_RUNTIME=hybrid` and engine room-loop both active.

### 8.3 Room-loop (per-room actor)

`RoomLoopManager` claims rooms → `RoomGameActor` schedules `runOneDrawCycle`:

- Recovery of unprocessed draws before new insert  
- `pickNextNumber` → owner-guarded insert → **synchronous** `processEngineDrawJob` with `leaseFence`  
- Settlement on full winner inside same job handler  

This path minimizes enqueue→pick latency and avoids picker lock during evaluate/finalize.

---

## 9. Critical operations checklist

| Operation | Server authoritative? | Atomic (intended) | Idempotent (intended) |
|-----------|----------------------|-------------------|------------------------|
| Join / buy-in | Yes | DB txn in join RPC | Partial (tickets + holds per call) |
| Draw insert | Yes | Owner-guard RPC | `duplicate` outcome |
| Draw finalize | Yes | Single RPC | Marks/results conflicts; processed_at |
| Ding credit | Yes | Batch RPC | Unique ding tx indexes |
| Settlement | Yes | DB function | Room `finished` guard |
| Cancel / refund | Yes | Ticket-scoped release | Per ticket |
| Client marks/win | N/A | — | — |
| Redis lock | Coordination only | NX + token | N/A |

---

## 10. Race scenarios & outcomes

| Scenario | Likely outcome | Severity |
|----------|----------------|----------|
| Two replicas pick different jobs **same room** without room lock | Parallel finalize attempts | **Med** — DB conflicts / one succeeds |
| Room lock miss | Job requeued | Low — by design |
| Stale job reaped while worker alive | Duplicate processing attempt | **Med** — mitigated by `processed_at` check |
| Reconnect during settlement | Client polls wallet; server completes settle | Low |
| Worker crash after finalize, before settle | Room stuck settling; janitor/retry | **Med** — money delay not double pay |
| Worker crash mid-finalize | Tx rollback; job requeued | Low |
| Redis down, multi-replica | Duplicate scheduler/picker activity | **High** ops — fail-closed if strict |
| Browser calls `rpc_pick_draw_jobs` | Can claim jobs if granted | **Critical** authz (Phase 3) |
| `fn_heartbeat_tick` from browser | Legacy draw/settle path | **Critical** authz |
| Lease epoch fence mismatch | Finalize returns -1; state evicted | Low — safe failure |
| Multiple tabs join | Serial wallet lock; multiple holds if balance allows | Low / financial |

---

## 11. Findings (attack / failure scenarios)

| ID | Severity | Class | Scenario | Location | Access | Impact |
|----|----------|-------|----------|----------|--------|--------|
| P5-CRIT-1 | **CRITICAL** | Authz bypass | Attacker invokes `rpc_pick_draw_jobs` / processes queue with crafted service or exposed RPC | PostgREST | anon/auth if granted | Corrupt draw pipeline, DoS, potential bad finalize if combined with other bugs |
| P5-CRIT-2 | **CRITICAL** | Authz bypass | `fn_heartbeat_tick` drives legacy room promotion/draws from client | DB RPC | anon/auth | Game state manipulation |
| P5-HIGH-1 | **HIGH** | Multi-replica | Redis unavailable + multiple engine replicas + not strict | `leaderLock.ts` | Deploy misconfig | Duplicate scheduler ticks, overlapping processing |
| P5-HIGH-2 | **HIGH** | Information | Predict draws after `room_seed` leak | Next API / rooms table | Player/anonymous read | Unfair advantage, not arbitrary draw choice |
| P5-HIGH-3 | **HIGH** | Settlement gap | Finalize succeeds, `fn_finish_room_and_settle` fails repeatedly | `processEngineDrawJob.ts` | — | Players not paid until janitor; state `settling` |
| P5-MED-1 | **MEDIUM** | Dual path | `hybrid` + engine room-loop both enabled | Ops / env | — | Double-draw or conflicting cadence |
| P5-MED-2 | **MEDIUM** | Lock TTL | Draw processing > 120s, second worker acquires room lock | Redis room lock | — | Extra requeue/retry pressure; idempotency should hold |
| P5-MED-3 | **MEDIUM** | Job replay | Stale reaper requeues job already being processed | `reapStaleJobs.ts` | — | Duplicate work; CPU/load |
| P5-MED-4 | **MEDIUM** | Client input | Max `cardCount` join spam | Join RPC | Player JWT | Wallet drain / room fill (economic) |
| P5-LOW-1 | **LOW** | Display | Optimistic Ding desync on reconnect | `useBalances.ts` | Player | UX only |

Engine **HTTP command API** (`GAME_ENGINE_API=true`): join validates JWT; CORS/engine URL exposure is Phase 2.

---

## 12. Duplicate payout / draw / state corruption — summary

| Threat | Engine mitigation | Residual |
|--------|-------------------|----------|
| **Duplicate draw number** | Owner insert + unique room/number; `duplicate` handling | Race before insert |
| **Multiple draws per tick** | Actor single-thread per room; job ordering | Misconfigured dual runtime |
| **Duplicate settlement** | `fn_finish_room_and_settle` finished guard | Concurrent settle callers |
| **Duplicate ding** | ding unique indexes + aggregated_at | Legacy trigger + engine both on? |
| **Invalid transition** | RPC status checks on insert/settle | Direct SQL if service role leaked |
| **Balance corruption** | Settlement in PostgreSQL finance core | Phase 4 RPC issues |

---

## 13. Diagram — engine draw path (room-loop)

```mermaid
sequenceDiagram
  participant Actor as RoomGameActor
  participant PG as PostgreSQL
  participant Redis as Redis
  participant Proc as processEngineDrawJob

  Actor->>PG: rpc_claim_game_room / renew lease
  Actor->>Actor: pickNextNumber(seed)
  Actor->>PG: rpc_insert_draw_if_ready_owner_guard
  Actor->>Proc: evaluate + finalize
  Proc->>PG: rpc_finalize_engine_draw_job (lease fence)
  alt full winner
    Proc->>PG: fn_finish_room_and_settle
  end
  Note over Redis: Room-loop lease in PG; Redis optional for draw-processor queue path
```

---

## 14. Phase 6 backlog (investigation only)

1. Confirm production `GAME_RUNTIME`, `GAME_ENGINE_ROLES`, `COORDINATION_STRICT`, replica count.  
2. Verify `setRoomSettling` conditional update vs concurrent settle.  
3. Confirm legacy `distribute_ding_on_draw` trigger disabled when engine ding path active.  
4. Load-test: room lock TTL vs p99 finalize duration.  
5. Map all callers of `rpc_insert_draw_if_ready` (non-owner) vs owner-guard only.  
6. Realtime wake path: can client flood draw-processor wakes (DoS)?  

---

## Appendix A — Key files

| Path | Topic |
|------|--------|
| `game-engine/src/index.ts` | Worker startup, Redis connect |
| `game-engine/src/workers/draw-processor/pickCoordinator.ts` | Pick lock, dispatch |
| `game-engine/src/workers/draw-processor/adaptivePollScheduler.ts` | Poll backoff |
| `game-engine/src/workers/room-loop/runDrawCycle.ts` | Authoritative draw cycle |
| `game-engine/src/domain/draw/processEngineDrawJob.ts` | Finalize + settle |
| `game-engine/src/domain/draw/filterActorOwnedDrawJobs.ts` | Actor vs processor split |
| `game-engine/src/redis/leaderLock.ts` | Degraded multi-replica behavior |
| `game-engine/src/http/commands.ts` | Client command surface |
| `game-engine/src/core/rng.ts` | Provably-fair pick |
| `sql/migrations/20260720120000_engine_lease_epoch_fencing.sql` | Finalize lease fence |

---

*End of Phase 5 report.*
