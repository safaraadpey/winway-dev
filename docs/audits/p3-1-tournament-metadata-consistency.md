# P3.1 — Tournament Metadata Consistency Fix

> **Date:** 2026-08-03  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Repo migration:** `sql/migrations/20260802223000_p3_1_tournament_metadata_consistency.sql`  
> **Applied on DEV as:**  
> - enum `settled` via `execute_sql`  
> - MCP `p3_1a_tournament_metadata_guard_capture`  
> - MCP `p3_1b_tournament_snapshot_at`  
> - MCP `p3_1c_tournament_finish_path_and_backfill`  
> **Commit / push:** **none**

---

## Status

```
P3_1_METADATA_FIX_READY_FOR_TEST
```

---

## Root cause

Completion flow (`tournament.fn_manage_tournament_cycle`):

1. mark tournament `finished`
2. `fn_payout_tournament`
3. commission payout + settle
4. `fn_capture_entry_locks` (or DING burn)

Gaps:

| Issue | Cause |
|-------|--------|
| `tournament_entries.status` stays `created` | Enum only had `created`/`cancelled`; finish path never marked participation complete; guard blocked entry updates after start |
| `tournament_locks.amount = 0` after capture | **Intentional** — `amount` = remaining outstanding hold; capture zeros it when wallet lock is consumed. Original amount was not stored in a dedicated immutable field (only opportunistic `meta.price`) |
| `tournaments.commission_snapshot_at` null | Snapshots created by `trg_te_commission_snapshot` → `fn_commission_snapshot_entry`, but that function never stamped `commission_snapshot_at` |

---

## Decisions

1. **Entry final status:** `settled` (new enum value) = non-cancelled entry after tournament finish settlement.  
   Lobby/tick/seating keep filtering `created` only → finished entries no longer look “open”.

2. **Lock amount:** keep `amount=0` after capture. Persist `meta.captured_amount` (immutable once set).

3. **`commission_snapshot_at`:** set on first successful snapshot via `fn_touch_commission_snapshot_at` (COALESCE first-wins).

---

## Files / migrations changed

- `sql/migrations/20260802223000_p3_1_tournament_metadata_consistency.sql` (canonical single file for other envs)
- Live functions updated:
  - `tournament.trg_guard_tournament_entry_mutations`
  - `tournament.fn_capture_entry_locks`
  - `tournament.fn_touch_commission_snapshot_at` (new)
  - `tournament.fn_commission_snapshot_entry`
  - `tournament.fn_commission_snapshot` (thin wrapper → entry)
  - `tournament.fn_payout_tournament` (`created`/`settled`)
  - `tournament.fn_manage_tournament_cycle` (mark entries settled after capture/burn)

No frontend/engine TS changes required for this metadata path.

---

## Before / after (Tournament 66)

| Field | Before | After |
|-------|--------|-------|
| entries status | 4× `created` | 4× `settled` |
| locks.amount | 0 | 0 (unchanged, intentional) |
| locks.meta.captured_amount | missing | `20000.00` ×4 |
| commission_snapshot_at | `null` | set from earliest snapshot |
| prize total | 72000 | 72000 |
| commission payouts | 8000 | 8000 |
| tx count / sum | 11 / 160000 | 11 / 160000 |

---

## Backfill scope (safe, proven)

1. `commission_snapshot_at` ← `min(tournament_commission_snapshots.created_at)` where null and snapshots exist  
2. `meta.captured_amount` for `status=captured` & `amount=0` from `entry.amount` or `meta.price * qty`  
3. finished tournaments: entry `created` → `settled`

Open/registration tournaments untouched (entries remain `created`).

---

## Validation results

- Tournament 66 financial fingerprint unchanged (prize/commission/tx)  
- Global: `finished_missing_snap_at=0`, `finished_entries_still_created=0`, `captured_locks_missing_amt=0`  
- `manage_patched=true`, `payout_patched=true`  
- Registration-open tournaments still show `created` entries  
- TS: no app code changed; `game-engine` `tsc` still reports pre-existing missing `ws` / redis deps (unrelated)

---

## Rollback plan

1. Restore prior function bodies from migrations:  
   - `20260218000500_capture_tournament_entry_locks_on_finish.sql`  
   - `20260220190000_fix_snapshot_entry_super_net_commission.sql`  
   - prior `trg_guard_tournament_entry_mutations`  
   - prior `fn_manage_tournament_cycle` / `fn_payout_tournament`  
2. Optional data rollback:  
   - `settled` → `created` for finished entries  
   - strip `meta.captured_amount`  
   - null `commission_snapshot_at`  
3. Enum value `settled` cannot be removed safely; leaving unused is harmless.

---

## Manual test checklist

- [ ] Open tournament lobby / registration still works  
- [ ] Join + hold on open tournament  
- [ ] Finish a paid tournament → entries `settled`, locks `captured` with `captured_amount`, `commission_snapshot_at` set  
- [ ] Prize + commission totals unchanged vs pre-finish wallet expectations  
- [ ] Cancel entry still only on non-locked tournaments  

---

## Final status

**P3_1_METADATA_FIX_READY_FOR_TEST**
