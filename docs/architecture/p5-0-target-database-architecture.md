# P5.0 — Target Database Architecture

> READ ONLY · Architecture only · **No migrations**  
> Companion to [p5-0-multigame-database-audit.md](./p5-0-multigame-database-audit.md)

Aligned with:

- `docs/CONSTITUTION.md` (multi-engine, Postgres truth, derived data)
- `docs/ENGINE_DEVELOPMENT_GUIDE.md` (ownership boundaries)
- P4.3/P4.4 code layout (`apps/engines/{bingo,backgammon}`, shared packages)

---

## 1. Design goals

1. **Platform owns money, identity, session shell, tournament framework, audit.**
2. **Each engine owns its rules, state machines, and evaluation.**
3. **No engine table required for another engine to boot.**
4. **Settlements always write through Platform ledger APIs.**
5. **Realtime / views remain derived** — never financial SoT.

---

## 2. Recommended schemas

| Schema | Owns | Never owns |
|--------|------|------------|
| `platform` | Users, wallets, ledger, commissions, flags, audit, engine registry, game sessions/templates shells, tournament framework, settlements orchestration | Housie cards, draws, marks, line/full rules |
| `bingo` | Card pools, tickets, draws, marks, results, evaluate, bingo room_state, bingo template_rules, bingo crons | Wallet balances, auth users |
| `backgammon` (future) | Matches, boards, moves, doubling cube, clocks | Wallet balances |
| `poker` / `roulette` (future) | Engine-specific tables | Wallet balances |
| `shared` (optional later) | Pure cross-cutting helpers with **no** game rules (e.g. lease kit, idempotency keys) | Prefer `platform` first; avoid a junk drawer |
| `monitor` | Ops views | Product SoT |

Supabase `auth` / `storage` / `cron` remain platform infrastructure (not Ding product schemas).

---

## 3. Platform Core (conceptual model)

### 3.1 Identity & money (stay / move as-is conceptually)

```text
platform.users
platform.user_profiles
platform.player_affiliation
platform.wallets
platform.transactions          -- append-only ledger
platform.commissions_*
platform.ding_balances         -- secondary currency ledger
platform.ding_transactions
platform.admin_*
platform.app_runtime_flags
```

**Never moves out of Platform:** wallet write path, ledger uniqueness, commission rates identity, auth linkage.

### 3.2 Engine registry

```text
platform.games                 -- id, code ('bingo'|'backgammon'|...), status
platform.engine_registry       -- engine_id, game_code, version, lease_owner, health
platform.engine_events         -- append-only engine→platform notifications (non-financial)
```

Purpose: discover which engines exist; route sessions; observe without embedding bingo columns.

### 3.3 Session shell (replaces bingo-shaped `rooms` as SoT)

```text
platform.game_templates        -- id, game_code, display, fee, capacity, status
platform.game_sessions         -- id, game_code, template_id, status, started_at, ...
platform.participants          -- session_id, user_id, seat, status, hold_ref
```

Bingo-specific columns (`draw_interval_sec`, `line_reward_%`, `pool_id`, …) **do not** live here.

They live in:

```text
bingo.template_rules           -- FK → platform.game_templates
bingo.room_state               -- FK → platform.game_sessions
bingo.tickets / draws / marks / results / card_*
```

Backgammon would add:

```text
backgammon.template_rules
backgammon.match_state
backgammon.moves
...
```

### 3.4 Settlements & lifecycle

```text
platform.settlements           -- session_id, status, idempotency_key, totals
platform.settlement_lines      -- user_id, amount, reason_code, engine_ref
```

Flow:

```text
Engine evaluates outcome (bingo/backgammon)
        ↓
Engine posts settlement request (idempotent)
        ↓
Platform validates + writes ledger (fn_wallet_* pattern)
        ↓
Engine may store prize-detail tables for UI (non-SoT for money)
```

**What stays shared:** settlement **orchestration** and wallet RPCs.  
**What never moves:** authoritative balance mutation.

### 3.5 Tournaments (framework vs adapter)

```text
platform.tournaments
platform.tournament_entries
platform.tournament_rounds
platform.tournament_matches    -- generic pairing → game_session_id
```

Bingo seating into card rooms becomes:

```text
bingo.tournament_adapters / seating links
```

not columns hard-coded on platform tables forever.

---

## 4. Bingo domain (target)

| Stays bingo-owned | Notes |
|-------------------|--------|
| Card pools & masks | Housie 1–90 |
| Tickets | Purchase/seat of a card |
| Draws / draw_jobs | Number sequence |
| Marks / evaluate | Line/full |
| Results / room_winners | win_type line/full |
| Card-pool cron step | Generation |
| Evaluate / apply marks RPCs | Engine SQL surface |

| Moves conceptually from today’s `rooms` | Into |
|-----------------------------------------|------|
| Lifecycle status, lease, capacity | `platform.game_sessions` |
| next_draw_at, pool_id, prize pools, seeds | `bingo.room_state` |

---

## 5. What stays / moves / never moves

### Stays (conceptually Platform — may remain in `public` until physical move)

- Users, wallets, transactions, affiliation, admin audit, flags, heartbeat retention

### Moves (to `bingo` when isolation phase runs)

- Card/draw/mark/ticket/result/pool objects and bingo evaluate RPCs
- Bingo-only views and bingo cron

### Splits (Category C — do not “move whole”)

| Today | Platform half | Bingo half |
|-------|---------------|------------|
| `room_templates` | game_templates | template_rules |
| `rooms` | game_sessions | room_state |
| `fn_join_*` | wallet hold + participant | card reservation |
| `fn_finish_room_and_settle` | ledger apply | prize split computation |
| tournaments | bracket/entries | seat→ticket |

### Never moves

| Object | Why |
|--------|-----|
| Wallet / transaction SoT | Financial safety |
| Auth users linkage | Identity |
| Append-only ledger semantics | Audit |
| Engine-local evaluation tables into Platform | Would re-create MIXED |

---

## 6. Cross-engine reuse patterns (not bingo tables)

Reusable **patterns** (document now; implement later):

| Pattern | Today (bingo) | Future Platform kit |
|---------|---------------|---------------------|
| Engine lease on session | `rooms` lease columns | `platform.game_sessions` lease |
| Job claim (FOR UPDATE SKIP LOCKED) | `draw_jobs` | optional `platform.engine_jobs` or per-engine jobs |
| Idempotent wallet delta | `fn_wallet_apply_delta` | stay Platform |
| Janitor timeouts | `fn_janitor_sweep` | Platform janitor + engine hooks |
| Snapshot APIs | GET room/wallet | Platform session snapshot + engine state embed |

Backgammon should **copy patterns**, not **reuse `draws` / `tickets`**.

---

## 7. API / PostgREST implications (non-binding)

Today almost everything is `public.*`. Target options:

1. **Logical schemas + views in `public`** for compatibility (preferred early)
2. Later: explicit grants / RPC-only access to engine schemas

Do **not** expose raw engine tables to browsers.

---

## 8. Consistency with code layout

| Code | DB |
|------|----|
| `apps/engines/bingo` | `bingo.*` |
| `apps/engines/backgammon` | `backgammon.*` |
| `packages/shared-db` (future) | clients for `platform.*` |
| `packages/game-contracts` | session/settlement DTOs — not bingo cards |

---

## 9. Non-goals of this document

- No CREATE SCHEMA / ALTER TABLE
- No dual-write design detail (see roadmap)
- No RLS rewrite
- No app code changes

Physical sequencing: [p5-0-migration-roadmap.md](./p5-0-migration-roadmap.md).
