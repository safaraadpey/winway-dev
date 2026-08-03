# P4.4 — Shared Contracts Plan

> Documentation plan for empty packages. **No shared implementations extracted.**

Canonical contract text: [`packages/game-contracts/ENGINE_CONTRACT.md`](../../packages/game-contracts/ENGINE_CONTRACT.md)  
Prior agreement: [p4-3-engine-contract.md](./p4-3-engine-contract.md)

---

## Package map

| Package | Role now | Role later (not in P4.4) |
|---------|----------|---------------------------|
| `game-contracts` | ENGINE_CONTRACT.md + empty `src` | Optional TS types for HTTP/command DTOs |
| `shared-types` | empty | Room/lobby/live-room DTOs shared by web + engines |
| `shared-events` | empty | Hard-exit / referral / domain event name constants |
| `shared-utils` | empty | Pure helpers (e.g. draw-order, fair RNG) after de-dupe |
| `shared-db` | empty | PG pool factory / query helpers (server-only) |

---

## Engine contract (summary)

### Lifecycle
- `start()` — boot process, connections, workers  
- `shutdown()` — drain, release locks, exit  
- `health()` — liveness/readiness; Bingo identity `bingo-engine`

### Room
- `claimRoom()` — exclusive/epoch-fenced ownership  
- `releaseRoom()` — drop ownership

### Game
- `processGame()` — advance rules + persist  
- `settle()` — finance RPCs only; idempotent

### Events
- `publishEvents()` — notify; not source of truth

No TypeScript abstractions in P4.4 — documentation only.

---

## Adoption rules (future)

1. First consumer of a shared package must be a **pure** move with parity tests.  
2. Engines must not import `apps/web`.  
3. `shared-db` must never be imported from client components.  
4. Wallet/settlement logic stays DB-owned; packages may only wrap call sites later.

---

## What P4.4 explicitly does not do

- Move Bingo `live-room` / RNG mirrors into packages  
- Add `dependencies` from Next or Bingo to `@dingmoney/*`  
- Change SQL or APIs  
