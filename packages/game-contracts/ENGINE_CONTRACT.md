# Engine Contract (game-contracts)

> Canonical contract for every engine under `apps/engines/<name>/`.  
> Agreed in P4.3; housed here in P4.4 as **documentation only** — no TypeScript interface yet.  
> Also see `docs/architecture/p4-3-engine-contract.md`.

## Principles

- PostgreSQL is the source of truth for money, identity, and durable game state.
- Engines orchestrate in-flight play; they do not invent a second ledger.
- Allowed I/O: HTTP, PostgreSQL / service RPCs, Redis coordination.
- Forbidden: importing `apps/web` or another engine’s `src/`.

## Lifecycle

### `start()`

Boot config/env, DB clients, optional Redis, identity, HTTP listeners, role-gated workers.  
Fail closed on missing secrets when required. Respect scheduler/role gates. Crash-restart safe.

### `shutdown()`

Drain work, release locks/leases, stop workers, close pools, exit cleanly. Prefer releasing leadership before exit. Rely on DB idempotency for crash windows.

### `health()`

Report liveness (and readiness when applicable) for Railway / probes.

- Bingo identity string: **`bingo-engine`** (P4.4)
- Must not leak secrets

## Room

### `claimRoom()`

Acquire exclusive or epoch-fenced ownership of a live session so one actor advances the clock. Time-bounded, renewable, safely stealable via fencing.

### `releaseRoom()`

Drop ownership so another replica (or none) can take over. Release on graceful shutdown and ownership loss.

## Game

### `processGame()`

Advance game-specific state for a claimed room or picked job: apply rules, persist outcomes, schedule next step. Rules stay inside the engine package. Persist via DB; realtime is notification only. At-least-once safe.

### `settle()`

Trigger durable financial settlement through existing finance RPCs / ledger paths. Engine orchestrates; DB owns money. Idempotent; no ad-hoc wallet math.

## Events

### `publishEvents()`

Notify UI/other services of changes (Realtime, broadcast, or outbox). Events are **not** source of truth. Clients must recover via snapshots.

## Bingo mapping (today)

| Op | Bingo location (illustrative) |
|----|--------------------------------|
| `start` / `shutdown` | `apps/engines/bingo/src/index.ts` |
| `health` | `apps/engines/bingo/src/health/server.ts`, HTTP `/health` |
| `claimRoom` / `releaseRoom` | `apps/engines/bingo/src/workers/room-loop/*` |
| `processGame` | draw / room-loop / bitmask domain |
| `settle` | `apps/engines/bingo/src/finance/*` |
| `publishEvents` | DB writes + `/v1` snapshots |

## Non-goals (P4.4)

- No shared TypeScript interface implementation  
- No forced rename of Bingo functions to these names  
- No extraction of Bingo code into this package  
