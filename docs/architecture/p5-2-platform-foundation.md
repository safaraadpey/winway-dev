# P5.2 — Platform Session Foundation

> **Phase:** P5.2 — Additive migration only  
> **Date:** 2026-08-03  
> **Migration:** `sql/migrations/20260803050638_p5_2_platform_session_foundation.sql`  
> **MCP name:** `p5_2_platform_session_foundation`  
> **Design basis:** [p5-1-platform-session-model.md](./p5-1-platform-session-model.md)

## Status

| Item | Result |
|------|--------|
| Schema `platform` | Created (DEV applied 2026-08-03) |
| Canonical tables | Created (7) |
| Bingo / rooms / wallet / settle | **Unchanged** |
| Dual-write / app cutover | **Not done** (out of scope) |
| Dummy session | Seeded (`p5_2_foundation_dummy_session`) |
| Post-apply validation | **PASS** — 2 games, 2 engines, dummy session+state, legacy rooms/tickets/draws intact |

---

## 1. ER diagram

```text
platform.games
    │ 1
    │
    │ * 
platform.engine_registry
    │ 1
    │
    │ *
platform.game_sessions ────────────┐
    │ 1                            │
    ├──────── * session_participants (user_id → public.users)
    ├──────── 1 session_state
    ├──────── * session_settlement   (unique session_id + settlement_key)
    └──────── * session_events       (unique session_id + seq)
```

No FKs to `rooms`, `tickets`, `draws`, `marks`, or card pools.

---

## 2. Table purposes

| Table | Purpose |
|-------|---------|
| `platform.games` | Product catalog (`bingo`, `backgammon`, …) |
| `platform.engine_registry` | Engine instances (`bingo-engine`, `backgammon-engine`) |
| `platform.game_sessions` | Lifecycle shell + lease + fee snapshot |
| `platform.session_participants` | Membership + opaque seat + hold_ref |
| `platform.session_state` | Thin version/flags/pointer (not the board) |
| `platform.session_settlement` | Settlement envelope (ledger still via existing finance RPCs) |
| `platform.session_events` | Append-only non-financial events |

**Forbidden columns (verified by design):** card, draw, mark, ticket, dice, board, line, full, pool.

---

## 3. FK map

| From | To | On delete |
|------|----|-----------|
| `engine_registry.game_id` | `games.id` | restrict (default) |
| `game_sessions.game_id` | `games.id` | restrict |
| `game_sessions.engine_id` | `engine_registry.id` | restrict |
| `session_participants.session_id` | `game_sessions.id` | CASCADE |
| `session_participants.user_id` | `public.users.id` | restrict |
| `session_state.session_id` | `game_sessions.id` | CASCADE |
| `session_settlement.session_id` | `game_sessions.id` | CASCADE |
| `session_events.session_id` | `game_sessions.id` | CASCADE |

**Not FK’d (reserved):** `game_sessions.template_id`, `game_sessions.tournament_match_id`.

**Trigger:** `trg_game_sessions_assert_engine_game` — `game_sessions.game_id` must equal `engine_registry.game_id` for `engine_id`.

---

## 4. Seed data

| Kind | id | code | status |
|------|-----|------|--------|
| Game | `a0000000-0000-4000-8000-000000000001` | `bingo` | enabled |
| Game | `a0000000-0000-4000-8000-000000000002` | `backgammon` | enabled |
| Engine | `b0000000-0000-4000-8000-000000000001` | `bingo-engine` | **active** |
| Engine | `b0000000-0000-4000-8000-000000000002` | `backgammon-engine` | **inactive** |

Dummy session:

| Field | Value |
|-------|--------|
| id | `c0000000-0000-4000-8000-000000000001` |
| correlation_key | `p5_2_foundation_dummy_session` |
| status | `created` |
| game / engine | bingo / bingo-engine |
| participants | none |
| linked to rooms? | **No** |

Also: `session_state` v0 + `session_events` seq=1 `session.created`.

---

## 5. ACL & RLS

| Role | Schema USAGE | Table privileges | RLS |
|------|--------------|------------------|-----|
| `PUBLIC` / `anon` / `authenticated` | No | Revoked | No policies → deny |
| `service_role` | Yes | ALL + explicit RLS policies | Bypass + policies |
| `postgres` | Yes | ALL | Superuser |

No PostgREST exposure intended for client JWTs in this phase.

---

## 6. Indexes

- `games(status)`, `games(code)` unique  
- `engine_registry(game_id)`, `(status)`, `(code)` unique  
- `game_sessions(game_id|engine_id|status|created_at)`, `(correlation_key)` unique  
- `session_participants(session_id|user_id|status)`, `(session_id,user_id)` unique  
- `session_settlement(session_id|status)`, `(session_id,settlement_key)` unique  
- `session_events(session_id|created_at)`, `(session_id,seq)` unique  

---

## 7. Validation checklist

| Check | Expected | Observed (DEV) |
|-------|----------|----------------|
| All seven tables exist in `platform` | Yes | **7** |
| FKs present (see §3) | Yes | **8** |
| Indexes | Present | **27** |
| RLS policies (service_role) | 7 | **7** |
| `anon` / `authenticated` schema USAGE | false | **false** |
| `service_role` schema USAGE | true | **true** |
| Seed games = 2, engines = 2 | Yes | bingo/backgammon; bingo-engine active / backgammon-engine inactive |
| Dummy session + state + event | Yes | `created`, state_version 0 |
| `public.rooms` / tickets / draws untouched | Yes | Still queryable (e.g. rooms 47 / tickets 444 / draws 1439 at validate time) |
| No RPC body changes in this migration | Yes | Additive DDL only |
| App code unchanged | Yes | Not wired |

### Validation SQL (post-apply)

```sql
SELECT code, status FROM platform.games ORDER BY code;
SELECT code, status FROM platform.engine_registry ORDER BY code;
SELECT id, status, correlation_key
FROM platform.game_sessions
WHERE correlation_key = 'p5_2_foundation_dummy_session';

-- Compatibility smoke: legacy objects still present
SELECT COUNT(*) AS rooms FROM public.rooms;
SELECT COUNT(*) AS tickets FROM public.tickets;
```

---

## 8. Rollback plan

Reversible because **additive only** — no Bingo objects altered.

```sql
BEGIN;
DROP SCHEMA platform CASCADE;
COMMIT;
```

Effects:

- Removes all P5.2 tables, trigger, function, policies, seeds, dummy session  
- **No** effect on `public.rooms`, wallets, settle RPCs, or Bingo engine  

Do **not** roll back if a later phase has already FKd into `platform.*` (none in P5.2).

---

## 9. Compatibility confirmation

| Surface | Impact |
|---------|--------|
| Bingo room lifecycle | None |
| Join / ticket / draw / mark / winners | None |
| Wallet / settlement RPCs | None |
| Application code | None (not wired) |
| Dual-write rooms ↔ sessions | **Not started** |

---

## 10. Explicit non-goals (still deferred)

- Adapting Bingo to `game_sessions`  
- Dual-write  
- Connecting `rooms.id` ↔ `game_sessions.id`  
- `platform.game_templates`  
- Tournament FK wiring  
- Backgammon engine implementation  

---

## Related

- [p5-1-platform-session-model.md](./p5-1-platform-session-model.md)  
- [p5-1-game-lifecycle.md](./p5-1-game-lifecycle.md)  
- [p5-0-migration-roadmap.md](./p5-0-migration-roadmap.md)  
