# P5.3 — Session Mapping (Bingo Room ↔ Platform Session)

> READ ONLY · Companion to [p5-3-bingo-platform-adapter.md](./p5-3-bingo-platform-adapter.md)

---

## 1. Canonical identity (recommendation)

**Use the same UUID for both rows.**

```text
platform.game_sessions.id  =  public.rooms.id
```

| Approach | Verdict |
|----------|---------|
| **A. Shared UUID** (`sessions.id = rooms.id`) | **Recommended** |
| B. New session UUID + `engine_state_ref` / map table → `rooms.id` | Rejected as primary (extra join, drift, tournament pain) |
| C. `rooms.platform_session_id` column only | Optional later denorm; not the primary key relationship |

### Why shared UUID

1. Permanent 1:1 with no map table for live traffic after dual-write starts.  
2. Tournaments / logs / support can cite one id.  
3. Backfill inserts `game_sessions` with `id = rooms.id` (see [backfill](./p5-3-backfill-strategy.md)).  
4. Matches P5.1 “same UUID” option; map table only needed if a conflicting session id already exists (e.g. P5.2 dummy — not a room).

### What not to put on Platform

Do **not** store `pool_id`, draw clocks, line/full %, card counts as Platform columns.  
Optional: `session_state.engine_state_ref = 'bingo.room:' || id` for humans/ops only.

---

## 2. Permanent relationship diagram

```text
public.rooms (Bingo SoT)
    id  ◄────────────────────────────┐
    status, lease_*, card_price, …     │ SAME UUID
                                       │
platform.game_sessions                 │
    id  ───────────────────────────────┘
    game_id → bingo
    engine_id → bingo-engine
    status (projected)
    lease_* (projected mirror)
    entry_fee ← snapshot of card_price / template fee (optional)
```

Child Platform rows use `session_id = rooms.id`:

- `session_state.session_id`
- `session_participants.session_id` (future mirror of joiners)
- `session_settlement.session_id`
- `session_events.session_id`

Bingo children (`tickets`, `draws`, …) keep `room_id` — **unchanged**.

---

## 3. Status alias map

Live Bingo `room_status` values (from system map):  
`idle`, `waiting`, `playing`, `settling`, `finished`, `cancelled` (+ legacy `live`).

| Bingo `rooms.status` | Platform `game_sessions.status` | Notes |
|----------------------|---------------------------------|-------|
| (row insert / pre-open) | `created` | Brief; often goes straight to waiting |
| `waiting` | `waiting` | |
| lease held while waiting/playing | `claimed` **or** keep waiting/running + lease fields | Prefer: mirror lease on session; use `claimed` when lease owner set and not yet playing |
| `playing` (legacy `live`) | `running` | |
| `settling` | `finished` | Play done; money in progress — Platform Finished = settle-eligible |
| `finished` (after settle) | `settled` | Money applied via existing Bingo settle |
| `cancelled` | `cancelled` | |
| cold / retention | `archived` | Janitor / retention policy |
| `idle` | `archived` or `cancelled` | Treat as terminal / unused; confirm per row age in backfill |

Engine-internal “Claimed” aligns with lease columns on `rooms`, not always a distinct enum value.

---

## 4. Field mapping (shell only)

| Platform field | Bingo source | Sync? |
|----------------|--------------|-------|
| `id` | `rooms.id` | Identity |
| `game_id` | constant bingo | On create |
| `engine_id` | constant bingo-engine | On create / claim |
| `status` | alias table §3 | Every transition |
| `capacity` | template / max players or cards policy | On create/update |
| `participant_count` | count distinct ticket users (optional) | Periodic or on join |
| `entry_fee` / `currency` | `card_price` / room currency | On create |
| `lease_owner` / `epoch` / `expires_at` | room lease columns | On claim/renew/release |
| `started_at` | first transition to playing | Once |
| `finished_at` | entering settling/finished play-complete | Once |
| `settled_at` | after `fn_finish_room_and_settle` success | Once |
| `template_id` | reserved; no FK yet | Optional later |
| `tournament_match_id` | tournament link if any | Optional later |
| `correlation_key` | e.g. `bingo.room:` \|\| id | On create |

**Never mapped into Platform columns:** draws, marks, tickets payloads, pool_id, line/full rewards, seeds, ding_per_number.

---

## 5. Participants mapping (future mirror)

| Platform | Bingo |
|----------|-------|
| `session_participants.user_id` | Distinct `tickets.user_id` (or join roster) |
| `hold_ref` | Ticket hold / reservation id if any |
| `seat_no` | Opaque; optional ticket order — **not** card_no as Platform meaning |

Tickets remain Bingo SoT for cards.

---

## 6. Settlement mapping (projection only)

| Platform | Bingo |
|----------|-------|
| `session_settlement.settlement_key` | e.g. `bingo.settle:` \|\| room_id |
| `status=applied` | After legacy settle succeeds |
| `lines` / `ledger_refs` | Optional copy of summary — **not** a second ledger |
| Wallet writes | **Still** existing finance RPCs only |

Adapter does **not** call a new Platform settle path in mirror phase.

---

## 7. Idempotency

Keys:

- Create: `INSERT … ON CONFLICT (id) DO NOTHING` / upsert status if exists  
- Status: `UPDATE … WHERE id = $room_id AND status IS DISTINCT FROM $target` (or monotonic rank guard)  
- Settlement: `UNIQUE (session_id, settlement_key)`  
- Events: `UNIQUE (session_id, seq)` or event idempotency key in payload  

| Duplicate op | Safe outcome |
|--------------|--------------|
| duplicate create | Existing session unchanged (or refreshed shell fields) |
| duplicate finish | No-op if status ∈ {finished, settled, archived} |
| duplicate settle | No-op if settlement row applied / session settled |
| duplicate archive | No-op if already archived |
| duplicate claim | Upsert lease fields; bump epoch only on real steal |

Monotonic status rank (example):

```text
created < waiting < claimed < running < finished < settled < archived
cancelled / failed are terminal side-paths
```

Never move backward except documented lease release: `claimed → waiting`.

---

## 8. Compatibility

- Mapping is **documentation** until a later sync worker exists.  
- No requirement to alter `rooms.id` generation.  
- P5.2 dummy session (`c0000000-…`) must **not** collide with a real room id (fixed non-room UUID).  

---

## Related

- [p5-3-sync-lifecycle.md](./p5-3-sync-lifecycle.md)  
- [p5-3-backfill-strategy.md](./p5-3-backfill-strategy.md)  
