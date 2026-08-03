# P5.1 — Platform Session Model

> **Phase:** P5.1 — READ ONLY  
> **Date:** 2026-08-03  
> **Authority:** Conceptual design only — no migrations, no SQL, no code  
> **Builds on:** [p5-0-target-database-architecture.md](./p5-0-target-database-architecture.md) · `docs/CONSTITUTION.md` · `docs/ENGINE_DEVELOPMENT_GUIDE.md` · `packages/game-contracts/ENGINE_CONTRACT.md`

Companions:

- [p5-1-platform-entity-model.md](./p5-1-platform-entity-model.md)
- [p5-1-game-lifecycle.md](./p5-1-game-lifecycle.md)
- [p5-1-settlement-boundary.md](./p5-1-settlement-boundary.md)

---

## 1. Problem

P5.0 showed:

- **Wallet / ledger / users** are reusable Platform Core.
- **`rooms` / tickets / draws / line-full** encode Bingo lifecycle.

Before Backgammon (or any second engine), Platform needs a **canonical session model** that:

1. Owns lifecycle, participation, money orchestration, and tournament linkage.
2. Knows **nothing** about game rules (cards, dice, cards-in-hand, roulette pockets, …).
3. Lets each engine attach domain state by `session_id`.

This document designs that model. It ignores today’s table shapes except as mapping targets in the entity companion.

---

## 2. Design principles

| Principle | Meaning |
|-----------|---------|
| Session ≠ room | “Room” is Bingo vernacular. Platform speaks **game_session**. |
| Opaque play | Platform stores **who / when / money / status** — never **how** play works. |
| One lifecycle | All engines share the same status machine ([p5-1-game-lifecycle.md](./p5-1-game-lifecycle.md)). |
| Settlement gate | Engines propose outcomes; Platform alone mutates wallets ([p5-1-settlement-boundary.md](./p5-1-settlement-boundary.md)). |
| Additive coexistence | Bingo keeps working on legacy paths while new engines use this model. |
| Snapshot-friendly | Clients recover via Platform session snapshot + engine embed — not realtime alone. |

---

## 3. Canonical entities (minimum set)

### 3.1 `games`

**Responsibility:** Catalog of product games Platform recognizes.

| Concern | Owns | Does not own |
|---------|------|--------------|
| Identity | `code` (`bingo`, `backgammon`, `poker`, `roulette`), display name, enabled flag | Rules, scoring, RNG |
| Routing | Which engine package / service owns play | Engine-internal config secrets |

One row per game product. Templates and sessions reference `game_id` / `game_code`.

---

### 3.2 `engine_registry`

**Responsibility:** Runtime registration of engine instances that may claim and advance sessions.

| Concern | Owns | Does not own |
|---------|------|--------------|
| Deployment | `engine_id`, `game_code`, version, environment | Per-session play state |
| Health / lease capacity | Last heartbeat, readiness, max concurrent claims | Winner detection |
| Contract alignment | Declared capability version vs `ENGINE_CONTRACT` | Game-specific job queues (optional later) |

Maps to engine ops: `start` / `shutdown` / `health` / claim capacity — not to Bingo draws.

---

### 3.3 `game_sessions`

**Responsibility:** The **Platform shell** for one playable instance of a game.

Minimum common data (game-agnostic):

| Field (conceptual) | Why every engine needs it |
|--------------------|---------------------------|
| `id` | Stable FK for participants, settlement, tournaments, engine state |
| `game_code` | Route to correct engine |
| `template_id` | Fee/capacity/catalog binding (Platform template shell) |
| `status` | Shared lifecycle ([lifecycle doc](./p5-1-game-lifecycle.md)) |
| `created_at` / `started_at` / `finished_at` / `settled_at` | Ops, janitor, reporting |
| `capacity` / `participant_count` | Join gates without knowing seats vs cards |
| `entry_fee` / `currency` (or fee snapshot) | Hold/settlement math without engine rules |
| `tournament_match_id` (nullable) | Optional tournament parent |
| `lease_owner` / `lease_epoch` / `lease_expires_at` | `claimRoom` / `releaseRoom` pattern — generalized |
| `idempotency` / correlation keys | Safe retries |

**Forbidden on `game_sessions`:** `pool_id`, `next_draw_at`, `line_reward_%`, dice state, hole cards, wheel sectors, or any rule column.

---

### 3.4 `session_participants`

**Responsibility:** Who is in the session and their **Platform-level** economic/seat status.

| Concern | Owns | Does not own |
|---------|------|--------------|
| Membership | `session_id`, `user_id`, join/leave times | Bingo ticket / Backgammon color / Poker seat chips layout |
| Economic hold | Hold/reservation reference into ledger | How many Housie cards they bought |
| Platform seat index | Optional opaque `seat_no` for UX ordering | Engine meaning of that seat |
| Status | `joined` / `active` / `left` / `forfeit` (Platform sense) | Disqualified by bingo evaluate rules |

Engines may have richer “player-in-match” tables keyed by `session_id` + `user_id`. Those are **not** substitutes for this table when money or tournament seating is involved.

---

### 3.5 `session_state`

**Responsibility:** Thin **Platform envelope** for claim/version/liveness — **not** the game board.

| Concern | Owns | Does not own |
|---------|------|--------------|
| Versioning | Monotonic `state_version` for optimistic concurrency | Board / card matrix / shoe |
| Claim fencing | Mirrors or summarizes lease for janitor | Draw job payloads |
| Pointer | Optional `engine_state_ref` (schema.table key or opaque token) | Parsed engine JSON as SoT |
| Dirty / needs_settle flags | Platform orchestration hints | Prize line/full computation |

**Rule:** Authoritative play state lives in **engine schemas** (`bingo.*`, `backgammon.*`, …).  
`session_state` exists so Platform janitors and snapshots can reason about sessions **without** opening engine tables.

---

### 3.6 `session_settlement`

**Responsibility:** Durable record of **money movement intent and completion** for a session.

| Concern | Owns | Does not own |
|---------|------|--------------|
| Lifecycle | `pending` → `applied` / `failed` / `cancelled` | Why player A beat player B |
| Idempotency | Settlement key unique per session (or per phase) | Engine rematch logic |
| Totals | Gross in, gross out, fees, commission summary | Bingo line vs full split detail (engine may supply lines) |
| Lines | Per-user credit/debit amounts + reason codes | Narrative “full house on ticket X” as ledger SoT |
| Ledger links | Transaction ids / before-after refs | Direct wallet UPDATE outside Platform RPCs |

Detail: [p5-1-settlement-boundary.md](./p5-1-settlement-boundary.md).

---

### 3.7 `session_events`

**Responsibility:** Append-only **Platform-visible** event log for recovery, audit, and UI notification — **not** financial truth.

| Concern | Owns | Does not own |
|---------|------|--------------|
| Envelope | `session_id`, `seq`, `type`, `at`, `actor` | Engine-private debug spam |
| Payload | Opaque or lightly typed JSON **safe for clients** | Secret RNG seeds (unless reveal protocol) |
| Delivery hint | “realtime may publish this” | Guaranteeing delivery |

Engines may keep richer internal event stores. Critical transitions (status changes, settle applied) **must** be recoverable from Platform tables + engine snapshot, not from this log alone.

Aligns with `publishEvents()` in the engine contract: events notify; snapshots correct.

---

## 4. Session abstraction — minimum common data

A Platform Session must support Bingo, Backgammon, Poker, Roulette **without knowing rules**.

### Required common surface

```text
identity:     session.id, game_code, template_id
lifecycle:    status + timestamps
people:       session_participants[]
money shell:  entry fee snapshot, holds, session_settlement
orchestration: lease, state_version, engine routing
linkage:      optional tournament_match_id
observability: session_events (envelope)
```

### Explicitly not common

| Engine | Domain (examples) — stay out of Platform |
|--------|------------------------------------------|
| Bingo | cards, pools, draws, marks, line/full |
| Backgammon | board, dice, cube, match length |
| Poker | streets, pot, hand ranks, blinds schedule |
| Roulette | spin, pocket, table layout, chip stacks |

### How engines attach

```text
platform.game_sessions.id
        │
        ├── bingo.room_state / tickets / draws / …
        ├── backgammon.match_state / moves / …
        ├── poker.hand_state / …
        └── roulette.spin_state / …
```

One FK convention: **`session_id` → `game_sessions.id`**. Engines never FK into another engine’s tables.

---

## 5. Templates (Platform shell vs engine rules)

Conceptual split (entity detail in companion):

| Layer | Entity | Contents |
|-------|--------|----------|
| Platform | `game_templates` (optional sibling of catalog) | `game_code`, display, fee, capacity, enabled |
| Engine | `*.template_rules` | Bingo draw interval / line%; Backgammon match points; etc. |

Platform join only needs fee + capacity + game_code. Engine join/validation loads rules by `template_id`.

---

## 6. Mapping to engine contract ops

| Contract op | Platform entity touchpoint |
|-------------|----------------------------|
| `claimRoom` / `releaseRoom` | `game_sessions` lease + `session_state` version |
| `processGame` | Engine tables; may append `session_events`; may bump `state_version` |
| `settle` | Writes/requests `session_settlement` → Platform ledger |
| `publishEvents` | Prefer projecting from DB → `session_events` / realtime |
| `health` | `engine_registry` |

---

## 7. Additive coexistence (summary)

| Path | Who uses it |
|------|-------------|
| Legacy Bingo `rooms` / join / settle | Continues unchanged until later cutover |
| New model `game_sessions` + engine schema | Backgammon (and optionally new Bingo writes later) |

Full strategy: [p5-1-platform-entity-model.md](./p5-1-platform-entity-model.md) § Migration.

**No breaking changes required for Bingo to keep running.**

---

## 8. Non-goals (this phase)

- Creating schemas/tables/migrations  
- Renaming `rooms`  
- Implementing TypeScript interfaces in `game-contracts`  
- Moving Bingo data  

---

## 9. Related deliverables

| Doc | Focus |
|-----|--------|
| [p5-1-platform-entity-model.md](./p5-1-platform-entity-model.md) | Bingo object → Platform vs Domain; tournaments; migration |
| [p5-1-game-lifecycle.md](./p5-1-game-lifecycle.md) | Shared status machine |
| [p5-1-settlement-boundary.md](./p5-1-settlement-boundary.md) | Money boundary |
