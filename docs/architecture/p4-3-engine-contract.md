# P4.3 — Engine Contract

> **Status:** Documentation only — no shared TypeScript interface or package yet.  
> **Audience:** Every future game engine under `apps/engines/<name>/`.  
> **Bingo today:** Implements these responsibilities concretely inside `apps/engines/bingo` (not as a formal interface).

---

## Purpose

A **game engine** is a long-lived Node process that owns **in-flight game orchestration** for one game family (Bingo, later Backgammon, …).

PostgreSQL remains the **source of truth** for money, identity, and durable game state.  
Engines must not invent a second ledger.

Communication with the web app and other services:

| Channel | Allowed |
|---------|---------|
| HTTP (`/health`, `/ready`, `/v1/*`, commands) | Yes |
| Direct PostgreSQL / Supabase service RPCs | Yes |
| Redis (coordination / locks) | Yes |
| Importing `apps/web` or another engine’s `src/` | **No** |

---

## Required lifecycle (minimum interface)

These are **logical** operations. Names need not match 1:1 in code today; Bingo maps them as noted.

### `start()`

**Responsibility:** Boot the process: load config/env, connect DB clients, optional Redis, register identity, start HTTP listeners, start role-gated workers.

**Bingo today:** `apps/engines/bingo/src/index.ts` → `main()`.

**Rules:**

- Fail closed on missing required secrets when roles need them.
- Respect `SCHEDULER_ENABLED` / role flags so local/API-only instances do not double-tick production.
- Be idempotent on crash restart (leases, job pick, settle must already be retry-safe).

---

### `shutdown()`

**Responsibility:** Drain in-flight work, release leadership/leases, stop workers, close Redis/DB pools, exit cleanly.

**Bingo today:** stop callbacks collected in `index.ts`; coordination drain flags.

**Rules:**

- Prefer releasing Redis locks and room leases before exit.
- Do not leave wallet/settlement half-applied; rely on DB idempotency + janitor for crash windows.

---

### `health()`

**Responsibility:** Report process liveness (and optionally readiness) for the platform (Railway, load balancers).

**Bingo today:**

- `GET /health` — liveness (`service: "game-engine"` JSON; keep stable for probes).
- `GET /ready` — coordination-aware readiness when wired.

**Rules:**

- `/health` must not require Redis/DB success for basic liveness unless product explicitly requires it.
- Do not put secrets in health payloads.

---

### `claimRoom()`

**Responsibility:** Acquire exclusive (or epoch-fenced) ownership of a live room/session so only one actor advances that room’s clock.

**Bingo today:** room-loop lease / claim RPCs (`roomLease`, `rpc_claim_game_room` family).

**Rules:**

- Claims must be time-bounded and renewable.
- Stale claims must be stealable safely via epoch/fencing.
- Never claim without a corresponding release/expiry path.

---

### `releaseRoom()`

**Responsibility:** Drop ownership so another replica (or none) can take over.

**Bingo today:** lease release / eviction on actor exit.

**Rules:**

- Release on graceful shutdown and on ownership loss.
- Do not release while a non-idempotent mutation is mid-flight without DB fencing.

---

### `processGame()`

**Responsibility:** Advance game-specific state for a claimed room (or for a picked job): apply rules, persist authoritative outcomes, schedule next step.

**Bingo today:** draw insert / mark / evaluate / room-loop draw cycle / `draw_jobs` drain.

**Rules:**

- Game rules stay **inside** the engine package (Bingo bitmask, future Backgammon rules, …).
- Persist via DB transactions/RPCs; realtime is notification only.
- Must be safe under at-least-once delivery (dedupe keys, status checks).

---

### `settle()`

**Responsibility:** Trigger durable financial settlement for a finished game session through **existing finance RPCs / ledger paths**. Engine may orchestrate; DB owns money truth.

**Bingo today:** `finance/settleRoom.ts` wrappers around settle RPCs when full-win / finish conditions hit.

**Rules:**

- **No new wallet math in the engine** without a DB contract.
- Settlement must be idempotent (replay must not double-pay).
- Engines must not bypass audit/ledger tables.

---

### `publishEvents()`

**Responsibility:** Make UI/other services aware of state changes (Realtime, broadcast, or durable outbox). Events are **not** source of truth.

**Bingo today:** DB writes that clients observe via Supabase Realtime / polling snapshots; engine HTTP snapshots for `/v1/*`.

**Rules:**

- Clients must be able to recover via snapshot APIs if an event is missed.
- Do not make financial decisions solely from published events.

---

## Mapping summary (Bingo)

| Contract op | Bingo primary locations |
|-------------|-------------------------|
| `start` / `shutdown` | `src/index.ts`, worker `stop`s |
| `health` | `src/health/server.ts`, API server health routes |
| `claimRoom` / `releaseRoom` | `src/workers/room-loop/*`, claim RPCs |
| `processGame` | `src/domain/draw/*`, `src/workers/*`, bitmask core |
| `settle` | `src/finance/*` |
| `publishEvents` | DB mutations + `/v1` reads (indirect) |

---

## Non-goals (this document)

- No shared npm package yet  
- No forced rename of Bingo functions to these names  
- No Backgammon implementation  
- No change to wallet schema  

Future packages (e.g. `packages/engine-runtime`) may encode this contract in TypeScript **after** a second engine proves the boundary.
