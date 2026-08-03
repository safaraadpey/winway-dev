# P5.7 — Platform Participant Shadow

> **Phase:** P5.7 — Participant shadow (WRITE ONLY)  
> **Date:** 2026-08-03  
> **Migration:** `sql/migrations/20260803114510_p5_7_platform_participant_shadow.sql`  
> **Depends on:** P5.4 room shadow (`fn_shadow_enqueue` / outbox / drain)

## Status

| Item | Result |
|------|--------|
| Bingo / wallet / settle / tournament / app reads | **Unchanged** |
| Platform production reads | **None** (WRITE ONLY) |
| Identity | `session_id = room_id`, `user_id = player_user_id` |
| Unique participants | `UNIQUE (session_id, user_id)` — one row per player per room |
| Initial recon | missing/dup/status/amount/ts mismatch = **0**; DLQ = **0** |

---

## 1. Architecture

```text
public.tickets INSERT/UPDATE/DELETE
        │
        ▼
trg_tickets_platform_shadow  (exceptions swallowed)
        │
        ▼
platform.fn_shadow_enqueue(room_id)   -- existing P5.4 outbox
        │
        ▼
fn_shadow_drain
   ├─ fn_shadow_mirror_room          -- session shell (unchanged SoT rules)
   └─ fn_shadow_mirror_participants  -- NEW: aggregate tickets → session_participants
```

Bingo remains SoT. Participant rows are a **projection**.

---

## 2. Event coverage

| Bingo signal | How mirrored |
|--------------|--------------|
| Player joins (ticket insert / reserved/confirmed) | Upsert participant `joined`/`active` |
| Leave / cancel / release / expire | Status `left`, `left_at` set |
| Refund / cancellation | Terminal reservation → `left`; amounts drop out of `amount_total` |
| Kick / disconnect | Same as cancel/release when tickets update |
| Settlement completion | Room finish already enqueues via rooms trigger; drain refreshes participants |
| Status changes | Re-aggregate on every ticket change |

Multiple tickets per user collapse to **one** Platform participant (ticket_count / amounts aggregated).

---

## 3. Status map

| Ticket aggregate | Platform status |
|------------------|-----------------|
| Any `reserved`/`confirmed`/`consumed` | `active` |
| Only `held` (active) | `joined` |
| No non-terminal tickets | `left` |

Terminal ticket statuses: `cancelled`, `released`, `expired`.

---

## 4. Amount / timestamp parity

| Field | Source |
|-------|--------|
| `amount_total` | `sum(price)` of non-terminal tickets |
| `amount_gross` | `sum(price)` of all tickets |
| `ticket_count` | non-terminal ticket count |
| `source_updated_at` | `max(tickets.updated_at)` |
| `hold_ref` | first `transaction_id` or `bingo.tickets:N` |

Not a second ledger — projection only.

---

## 5. Failure / retry

Same as P5.4:

- Trigger never fails Bingo
- Outbox + exponential backoff + DLQ
- Never blocks wallet/settlement

---

## 6. New / updated objects

| Object | Role |
|--------|------|
| Columns on `session_participants` | ticket_count*, amount_*, source_updated_at, mirror_meta |
| `fn_shadow_map_participant_status` | Status alias |
| `fn_shadow_mirror_participants` | Idempotent upsert |
| `trg_tickets_platform_shadow` | Enqueue |
| `fn_shadow_drain` | Calls room + participant mirror |
| `fn_shadow_reconcile` | Includes participant missing/amount drift |
| `fn_shadow_participant_recon_report` | Ops reconciliation JSON |

---

## 7. Rollback

```sql
DROP TRIGGER IF EXISTS trg_tickets_platform_shadow ON public.tickets;
DROP FUNCTION IF EXISTS platform.trg_tickets_platform_shadow();
DROP FUNCTION IF EXISTS platform.fn_shadow_mirror_participants(uuid, integer);
DROP FUNCTION IF EXISTS platform.fn_shadow_map_participant_status(integer, boolean, boolean);
DROP FUNCTION IF EXISTS platform.fn_shadow_participant_recon_report();
-- Restore P5.4 fn_shadow_drain / fn_shadow_reconcile bodies if required.
-- Optional: DELETE FROM platform.session_participants;
-- Optional: DROP additive columns.
```

Does not touch Bingo tickets or money paths.

---

## Related

- [p5-4-shadow-mode.md](./p5-4-shadow-mode.md)
- [p5-6-cutover-readiness.md](./p5-6-cutover-readiness.md) — participant gap closed for Stage 3 prerequisite
- [p5-7-participant-reconciliation.md](../testing/p5-7-participant-reconciliation.md)
