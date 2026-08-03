# P5.5 — Shadow Regression Fix: `room_pool_required_chk`

> Harness-only fix. Production SQL / Bingo runtime unchanged.

## Root cause

Production CHECK:

```sql
room_pool_required_chk:
  CHECK (
    status <> ALL (ARRAY['waiting','playing','settling'])
    OR pool_id IS NOT NULL
  )
```

Failing scenarios called `createHarnessRoom()` **without** `poolId`, inserting `waiting` rooms with `pool_id = NULL` → constraint violation.

Scenarios that already passed a pool (`bingo-lobby-2/4`, `bingo-card-pool-1001`) or used existing rooms (`bingo-tournament`, `bingo-commission`) passed.

## Fix (harness only)

`tools/shadow-regression/src/engines/bingo/driver.mjs` — `createHarnessRoom`:

- Always resolve `poolId` via `opts.poolId ?? getAnyPoolId()`
- Throw a clear error if no `card_pools` row exists
- Never insert a `waiting` room without `pool_id`

## Before / after

| Metric | Before | After |
|--------|--------|-------|
| Overall | **FAIL** | **PASS** |
| PASS | 5 | **15** |
| FAIL | 10 | **0** |
| SKIP | 0 | 0 |
| Exit code | 1 | **0** |

### Per-scenario

| Scenario | Before | After |
|----------|--------|-------|
| bingo-lobby-2 | PASS | PASS |
| bingo-lobby-4 | PASS | PASS |
| bingo-early-winner | FAIL (`room_pool_required_chk`) | PASS |
| bingo-late-winner | FAIL (`room_pool_required_chk`) | PASS |
| bingo-multi-line | FAIL (`room_pool_required_chk`) | PASS |
| bingo-multi-full | FAIL (`room_pool_required_chk`) | PASS |
| bingo-card-pool-1001 | PASS | PASS |
| bingo-tournament | PASS | PASS |
| bingo-restart-waiting | FAIL (`room_pool_required_chk`) | PASS |
| bingo-restart-running | FAIL (`room_pool_required_chk`) | PASS |
| bingo-dup-shadow | FAIL (`room_pool_required_chk`) | PASS |
| bingo-retry-shadow | FAIL (`room_pool_required_chk`) | PASS |
| bingo-delayed-outbox | FAIL (`room_pool_required_chk`) | PASS |
| bingo-settlement | FAIL (`room_pool_required_chk`) | PASS |
| bingo-commission | PASS | PASS |

### Artifacts

| Report | Path |
|--------|------|
| Before | `tools/shadow-regression/reports/before-pool-fix.md` |
| After | `tools/shadow-regression/reports/latest.md` |

Soft issues remaining (non-blocking): participant mirror gaps — expected until P5.x participant shadow; unrelated to pool constraint.

## Non-goals confirmed

- Constraint **not** weakened or removed
- Production SQL **not** modified
- Bingo runtime **not** modified
