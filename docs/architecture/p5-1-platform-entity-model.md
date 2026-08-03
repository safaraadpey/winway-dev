# P5.1 — Platform Entity Model

> READ ONLY · Conceptual · Companion to [p5-1-platform-session-model.md](./p5-1-platform-session-model.md)

This document classifies current Bingo objects, shows the entity relationship model, tournament compatibility, and an **additive** migration strategy so Bingo keeps working while Backgammon uses the new session model.

---

## 1. Entity relationship (conceptual)

```text
games 1──* engine_registry
games 1──* game_templates (Platform shell)
game_templates 1──* game_sessions
game_sessions 1──* session_participants
game_sessions 1──1 session_state          (thin envelope)
game_sessions 1──* session_settlement     (usually 1 applied)
game_sessions 1──* session_events

game_sessions 0..1── tournament_matches (Platform tournament framework)

game_sessions 1──0..1 bingo.room_state (+ tickets, draws, …)
game_sessions 1──0..1 backgammon.match_state (+ …)
```

Templates: Platform shell holds fee/capacity/`game_code`; engine `template_rules` hold rule knobs.

---

## 2. Current Bingo objects → Platform vs Bingo Domain

### 2.1 `rooms`

| Decision | **Split** — shell → **Platform**; play fields → **Bingo Domain** |
|----------|-------------------------------------------------------------------|

**Why:** Today’s `rooms` is the Category C hotspot (P5.0). Lifecycle, lease, capacity, and identity are session concepts every engine needs. `pool_id`, `next_draw_at`, `line_*` / `full_*` prize pools, Housie seeds, and draw clock are Bingo-only.

| Becomes | Concept |
|---------|---------|
| Platform | `game_sessions` (+ lease fields, status, fee snapshot) |
| Bingo | `bingo.room_state` (draw clock, pool link, prize pool mirrors, seeds) |

Do **not** keep Bingo columns on the Platform session forever “for convenience.”

---

### 2.2 `tickets`

| Decision | **Bingo Domain** |
|----------|------------------|

**Why:** A ticket is a purchased Housie card seat (`card_no`, `pool_card_id`, `claimed_bingo_at`). Backgammon has no tickets. Platform needs **`session_participants`** (and holds), not card rows.

| Related Platform concept | `session_participants` + hold_ref |
| Traceability | Settlement `engine_ref` may cite `ticket:<id>` |

---

### 2.3 `draws`

| Decision | **Bingo Domain** |
|----------|------------------|

**Why:** Number sequence 1–90 is Housie. Roulette has spins; Backgammon has dice — different tables. Platform lifecycle does not need draw rows.

---

### 2.4 `marks`

| Decision | **Bingo Domain** |
|----------|------------------|

**Why:** Card cell marking / bitmask evaluation is Bingo rules. No Platform equivalent.

---

### 2.5 `winners` (`results` / `room_winners`)

| Decision | **Bingo Domain** (outcome detail) + **Platform** (money lines only) |
|----------|----------------------------------------------------------------------|

**Why:** `win_type` line/full and ticket winners are Bingo evaluation. Platform stores **settlement lines** (user, amount, reason). Trophy/UI history can remain Bingo tables keyed by `session_id`.

| Do not promote | `results.win_type` into Platform enums |

---

### 2.6 Card pools (`card_pools`, `card_pool_cards`, masks, …)

| Decision | **Bingo Domain** |
|----------|------------------|

**Why:** Housie card generation and bitmask indexes are pure Bingo. No other engine shares this inventory.

---

### 2.7 Templates (`room_templates`)

| Decision | **Split** — catalog shell → **Platform**; rule columns → **Bingo Domain** |
|----------|----------------------------------------------------------------------------|

**Why:** Every game needs a sellable template (fee, capacity, enabled, name). `draw_interval_sec`, `line_reward_percentage`, `full_reward_percentage`, `ding_per_number`, `max_cards_per_player` are Bingo rules.

| Platform | `game_templates` (`game_code`, fee, capacity, display, status) |
| Bingo | `bingo.template_rules` |

---

### 2.8 Summary table

| Current object | Platform | Bingo Domain | Why (short) |
|----------------|----------|--------------|-------------|
| `rooms` | Session shell | Room/play state | MIXED today; must split |
| `tickets` | — (use participants) | Yes | Card purchase |
| `draws` | — | Yes | Housie sequence |
| `marks` | — | Yes | Card marks |
| `winners` / `results` | Settlement amounts only | Outcome detail | Rules vs money |
| Card pools | — | Yes | Housie inventory |
| `room_templates` | Template shell | Rule knobs | MIXED today; must split |

---

## 3. Tournament compatibility

### 3.1 Target

Tournaments reference **`game_sessions.id`**, not Bingo `rooms.id`.

```text
platform.tournaments
  → tournament_rounds
    → tournament_matches
      → game_session_id   -- FK to platform.game_sessions
```

Progression uses Platform lifecycle (**Finished** / **Settled**), not Bingo `results`.

### 3.2 Required changes (design only — no implementation)

| Area | Change |
|------|--------|
| Match child | Create `game_sessions` with `game_code` + template; engine attaches domain state |
| Seating | Platform seats `session_participants`; Bingo adapter allocates tickets; Backgammon adapter assigns colors |
| Completion | Bracket advances when session **Settled** (or policy: Finished + zero-money) |
| Legacy Bingo tournaments | Keep `room_id` during coexistence; add nullable `game_session_id`; dual-write or map view |
| Prize tables | Engine-specific; tournament GMV via Platform settlement |

### 3.3 What tournaments must stop assuming

- Every match is a Bingo room with cards  
- Winners are line/full  
- Join path is `fn_join_or_create_room*` only  

### 3.4 Verification (conceptual)

| Check | Result |
|-------|--------|
| Can a tournament schedule a Backgammon session? | Yes — `game_code=backgammon` + `backgammon.*` state |
| Can Bingo tournaments keep working during migration? | Yes — legacy room_id path until cutover |
| Does Platform need Bingo winner tables? | No — only session completion + settlement |

---

## 4. Additive migration strategy

**Goal:** Old Bingo continues; Backgammon uses the new model; **no breaking changes** to live Bingo paths.

### 4.1 Parallel worlds

```text
[Legacy Bingo path]                    [New Platform path]
public.rooms / tickets / …             platform.game_sessions
game_core join / settle (unchanged)    + backgammon.* (or new bingo writers)
tournaments → room_id                  tournaments → game_session_id
```

### 4.2 Steps (additive only)

| Step | Action | Bingo impact |
|------|--------|--------------|
| A | Document + optional empty `games` / `engine_registry` catalog | None |
| B | Add `game_sessions` (+ participants/state/settlement/events) **new** | None |
| C | Backgammon engine writes only new tables | None |
| D | Add nullable `game_session_id` on tournament match tables | None if unused |
| E | Compatibility **views** mapping `rooms` → session-shaped read model (optional) | Read-only; writers unchanged |
| F | Later (not required for Backgammon launch): Bingo dual-write session shell | Controlled |
| G | Much later: cut Bingo writers to Platform shell; drop bingo columns from rooms | Breaking window — separate phase |

**Backgammon does not require F/G.** It can launch on the new model while Bingo stays legacy.

### 4.3 Non-breaking guarantees

- No rename of `rooms` / `tickets` in early steps  
- No change to existing join/settle RPC signatures for Bingo  
- No DROP of Bingo columns until a dedicated cutover phase  
- New tables are append-only coexistence  

### 4.4 Mapping aid (optional later)

| Legacy | New |
|--------|-----|
| `rooms.id` | May equal `game_sessions.id` **or** map table `bingo.room_session_map` |
| Prefer | Explicit map table if ids must diverge |

Choosing **same UUID** for session and legacy room simplifies tournaments but couples cutover; a **map table** is safer for additive migration.

---

## 5. Minimum field checklist (Platform)

### `games`

`id`, `code`, `name`, `status`, `created_at`

### `engine_registry`

`id`, `game_code`, `instance_id`, `version`, `status`, `last_health_at`, metadata

### `game_sessions`

See [session model](./p5-1-platform-session-model.md) §3.3 — id, game_code, template_id, status, timestamps, capacity, fee snapshot, lease, tournament_match_id

### `session_participants`

`id`, `session_id`, `user_id`, `seat_no?`, `status`, `hold_ref?`, timestamps

### `session_state`

`session_id`, `state_version`, `lease_*` summary, `engine_state_ref?`, flags

### `session_settlement`

`id`, `session_id`, `settlement_key`, `status`, totals, line children, ledger refs

### `session_events`

`id`, `session_id`, `seq`, `type`, `payload`, `at`

---

## 6. Anti-patterns

| Anti-pattern | Why forbidden |
|--------------|---------------|
| `game_sessions.draw_interval_sec` | Bingo leak |
| Reusing `tickets` for Backgammon seats | Wrong domain |
| Tournament FK only to `rooms` forever | Blocks multi-game |
| Engine updates wallet | Financial boundary breach |
| Platform enum value `line_won` | Bingo leak into lifecycle |
| Big-bang rename before Backgammon ships | Unnecessary risk |

---

## 7. Alignment

| Source | Alignment |
|--------|-----------|
| P5.0 | Confirms rooms/templates MIXED; pure Bingo objects listed |
| Engine guide | Platform owns settlement; engine owns rules |
| Engine contract | claim / process / settle / events map cleanly |
| P5.0 roadmap | Additive phases match P5.2–P5.3 before hard splits |

---

## 8. Non-goals

- Migrations / DDL  
- Editing live Bingo functions  
- Choosing final Postgres schema names vs `public` compatibility views  
- Implementing `packages/game-contracts` TypeScript types  

---

## Related

- [p5-1-platform-session-model.md](./p5-1-platform-session-model.md)  
- [p5-1-game-lifecycle.md](./p5-1-game-lifecycle.md)  
- [p5-1-settlement-boundary.md](./p5-1-settlement-boundary.md)  
- [p5-0-migration-roadmap.md](./p5-0-migration-roadmap.md)  
