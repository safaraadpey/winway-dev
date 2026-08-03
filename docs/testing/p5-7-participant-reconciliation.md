# P5.7 — Participant Shadow Reconciliation Report

> **Generated:** 2026-08-03 (DEV after backfill)  
> **RPC:** `SELECT platform.fn_shadow_participant_recon_report();`  
> **Harness:** optional follow-up — `npm run test:shadow` (soft participant checks should clear for mirrored rooms)

## Validation snapshot

| Metric | Value |
|--------|------:|
| Sessions checked (bingo.room:*) | 64 |
| Participants checked (distinct Bingo room+user) | 87 |
| Platform participant rows | 99 |
| Missing (active Bingo → Platform) | **0** |
| Duplicate `(session_id, user_id)` | **0** |
| Status mismatch | **0** |
| Amount mismatch | **0** |
| Timestamp mismatch | **0** |
| Pending outbox | **0** |
| DLQ | **0** |
| Max retry count observed | 1 |

`platform_participants` (99) ≥ `bingo_participant_keys` (87) because cancelled-only users remain as `left` rows (expected).

## Checks performed

For every Bingo ticket aggregate `(room_id, player_user_id)`:

1. Exactly one Platform row when active (or `left` when terminal-only)
2. No duplicate keys
3. Status = mapped Bingo reservation aggregate
4. `amount_total` = sum of non-terminal ticket prices
5. `source_updated_at` = max ticket `updated_at` when set
6. Outbox empty / DLQ empty after drain

## How to re-run

```sql
SELECT platform.fn_shadow_reconcile(5000);
SELECT platform.fn_shadow_drain(5000);
SELECT platform.fn_shadow_participant_recon_report();
```

## Acceptance

| Requirement | Result |
|-------------|--------|
| Every active Bingo participant → one Platform participant | **PASS** |
| No missing / no duplicate | **PASS** |
| Status / amount / timestamp parity | **PASS** |
| Platform WRITE ONLY / no app reads | **PASS** |
| Bingo money paths unchanged | **PASS** |

## Notes

- Identity: `session_id = rooms.id`, `user_id = tickets.player_user_id`
- Multi-ticket players collapse to one participant with `ticket_count`
- Not financial SoT — wallet/settle remain Bingo/finance RPCs
