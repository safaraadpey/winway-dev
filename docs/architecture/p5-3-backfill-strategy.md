# P5.3 — Backfill Strategy

> READ ONLY · Companion to [p5-3-bingo-platform-adapter.md](./p5-3-bingo-platform-adapter.md)

Design for turning **existing** Bingo rooms into Platform sessions **without** changing live traffic.

---

## 1. Goals

| Goal | Detail |
|------|--------|
| Coverage | Every selected historical/active `rooms` row gets one `game_sessions` row |
| Identity | `game_sessions.id = rooms.id` |
| Safety | No Bingo writes; no settle/join/RPC changes; no app deploy required |
| Traffic | Live Bingo continues on legacy path only |
| Idempotent | Re-runnable batches |

---

## 2. Non-goals

- Dual-write for new rooms (separate later phase)  
- Migrating tickets/draws/marks into Platform  
- Changing room statuses  
- Deleting or renaming rooms  
- Switching APIs to read `game_sessions`  

---

## 3. Approach: offline projection backfill

```text
                    ┌──────────────┐
  read-only         │ public.rooms │
  snapshot ────────►│ (unchanged)  │
                    └──────┬───────┘
                           │ batch job (SQL or worker)
                           ▼
                    ┌──────────────────┐
                    │ platform.*       │
                    │ INSERT … ON      │
                    │ CONFLICT DO      │
                    │ UPDATE (shell)   │
                    └──────────────────┘
```

- Runs as **maintenance** (off hot path).  
- Uses service_role / postgres.  
- Does not lock Bingo gameplay tables longer than short batch selects.

---

## 4. Scope selection

| Cohort | Include? | Notes |
|--------|----------|-------|
| Active `waiting` / `playing` / `settling` | Yes (high priority) | Needed before dual-write |
| Recent `finished` / `cancelled` | Yes | Support / reporting |
| Ancient finished | Optional | Batch by `created_at` windows |
| P5.2 dummy session | Exclude | Not a room |
| Orphan test rooms | Include or skip via allowlist | Ops choice |

Suggested order:

1. Active rooms  
2. Last N days terminal  
3. Older history in chunks  

---

## 5. Row construction rules

For each `rooms` row `r`:

| Platform | Value |
|----------|--------|
| `id` | `r.id` |
| `game_id` | seeded bingo game |
| `engine_id` | seeded bingo-engine |
| `status` | alias map ([session-mapping](./p5-3-session-mapping.md) §3) |
| `entry_fee` | `r.card_price` (or null if unavailable) |
| `lease_*` | copy from room if columns exist |
| `started_at` / `finished_at` / `settled_at` | best-effort from room timestamps / status |
| `correlation_key` | `bingo.room:` \|\| `r.id` |
| `session_state` | upsert v0 or bump if re-backfill |
| `session_settlement` | only if room already settled/finished with money — optional summary row |
| `session_events` | single `session.backfilled` event (seq=1) if new |

**Do not** backfill draws/marks into Platform.

Participants: optional second pass (distinct ticket users) — can defer.

---

## 6. Idempotency & conflict

```text
INSERT game_sessions (id, …)
ON CONFLICT (id) DO UPDATE
  SET status = EXCLUDED.status,  -- or only if monotonic newer
      updated_at = now(),
      …
```

| Situation | Action |
|-----------|--------|
| Session missing | Insert |
| Session exists, same room id | Refresh shell from Bingo (reconcile) |
| Session exists with different correlation meaning | Should not happen if id = room id |
| Status drift during backfill | Prefer Bingo value (Bingo SoT) |

---

## 7. Without changing live traffic

| Guard | How |
|-------|-----|
| No triggers on `rooms` yet | Backfill is pull-based, not trigger dual-write |
| No app reads Platform for Bingo | Clients unchanged |
| No settle changes | Settlement rows are projections only |
| Rate limit | Batches of e.g. 100–1000 ids; sleep between |
| Locks | `SELECT … WHERE id IN (…) FOR SHARE` optional; avoid long transactions |

Live rooms may change mid-backfill → **reconcile pass** after backfill catches drift ([sync-lifecycle](./p5-3-sync-lifecycle.md) §5).

---

## 8. Validation

| Check | Query idea |
|-------|------------|
| Coverage | Active rooms without session = 0 |
| Identity | `sessions.id` ∈ `rooms.id` for bingo-mirrored set |
| Status agreement | Compare alias(room.status) vs session.status; allow lag window |
| No Bingo mutation | `rooms.updated_at` distribution unchanged by job (spot check) |
| Dummy intact | P5.2 dummy still present and not a room |

---

## 9. Rollback

Backfill rollback is **Platform-only**:

```text
DELETE FROM platform.session_events WHERE session_id IN (backfilled set);
DELETE FROM platform.session_settlement WHERE …;
DELETE FROM platform.session_state WHERE …;
DELETE FROM platform.session_participants WHERE …;
DELETE FROM platform.game_sessions WHERE correlation_key LIKE 'bingo.room:%';
-- or WHERE id IN (SELECT id FROM rooms)
```

Never DELETE from `rooms`.

---

## 10. Future migration plan (after backfill design)

| Step | Action | Live Bingo impact |
|------|--------|-------------------|
| P5.3 | This design | None |
| Backfill job (implement later) | Project history | None |
| Outbox dual-write | New room transitions enqueue mirror | None if async; Bingo path identical |
| Reconcile cron | Heal drift | None |
| Read-side experiments | Admin tools read Platform | Bingo player APIs unchanged |
| Control-plane cutover | Separate program | High risk — not part of adapter mirror |

---

## 11. Compatibility confirmation

| Requirement | Met? |
|-------------|------|
| Current Bingo behavior identical during backfill | **Yes** (read rooms, write platform only) |
| No application changes required | **Yes** |
| No API changes | **Yes** |
| No settlement changes | **Yes** |

---

## Related

- [p5-3-session-mapping.md](./p5-3-session-mapping.md)  
- [p5-3-sync-lifecycle.md](./p5-3-sync-lifecycle.md)  
- [p5-2-platform-foundation.md](./p5-2-platform-foundation.md)  
