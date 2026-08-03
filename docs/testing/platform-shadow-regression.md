# Platform Shadow Regression Harness

> **Phase:** P5.5  
> **Harness:** `tools/shadow-regression/`  
> **Command:** `npm run test:shadow`  
> **Depends on:** P5.4 Shadow Mode (`platform.fn_shadow_*`, outbox, mirror)

## Purpose

Replace manual Bingo gameplay checks with a **repeatable** regression suite that validates:

```text
Legacy Bingo room  →  Platform session (shadow)
```

Platform remains **WRITE ONLY**. The harness reads Platform only for validation (ops/test), not production app traffic.

## Requirements

| Need | Notes |
|------|-------|
| `DATABASE_URL` | Direct Postgres. `platform.*` is not exposed on PostgREST for client roles. |
| P5.4 objects | `fn_shadow_enqueue`, `fn_shadow_drain`, `fn_shadow_mirror_room`, outbox, mirror log |
| Node 18+ | Uses root `pg` + `dotenv` |

```bash
# .env.local
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-....pooler.supabase.com:6543/postgres

npm run test:shadow
```

Optional:

```bash
SHADOW_REGRESSION_FILTER=bingo-lobby-2,bingo-dup-shadow
SHADOW_REGRESSION_KEEP_ROOMS=1
SHADOW_REGRESSION_ENGINE=bingo
npm run test:shadow
```

## Scenarios (Bingo)

| ID | Title |
|----|-------|
| `bingo-lobby-2` | Normal lobby (2 players) |
| `bingo-lobby-4` | Normal lobby (4 players) |
| `bingo-early-winner` | Early winner |
| `bingo-late-winner` | Late winner |
| `bingo-multi-line` | Multiple line winners |
| `bingo-multi-full` | Multiple full winners |
| `bingo-card-pool-1001` | Card pool 1001+ |
| `bingo-tournament` | Tournament |
| `bingo-restart-waiting` | Engine restart during waiting |
| `bingo-restart-running` | Engine restart during running |
| `bingo-dup-shadow` | Duplicate shadow event |
| `bingo-retry-shadow` | Retry shadow event |
| `bingo-delayed-outbox` | Delayed outbox processing |
| `bingo-settlement` | Settlement completed |
| `bingo-commission` | Commission completed |

Scenarios drive **synthetic** Bingo rooms through status/lease transitions that already fire the P5.4 shadow trigger. They do **not** change wallet/settle RPC code. Commission scenario prefers an existing `commissions_log` room when present.

## Automatic validation (every scenario)

Hard fail if any:

- Missing Platform session
- Duplicate session for room id
- Identity `session.id !== room.id`
- Lifecycle divergence (Bingo map ≠ Platform status)
- Settlement missing/not applied when Bingo `finished`
- Settlement timestamp mismatch
- Pending outbox for room
- DLQ entries for room

Soft (reported, do not fail overall):

- Participants not mirrored (P5.4 does not yet sync tickets → `session_participants`)
- Commission absent on synthetic rooms
- High retry counts

## Reports

| File | Content |
|------|---------|
| `tools/shadow-regression/reports/latest.md` | Human PASS/FAIL table |
| `tools/shadow-regression/reports/latest.json` | Machine-readable |
| `tools/shadow-regression/reports/report-*.json` | Timestamped copy |

Each scenario row: Room ID, Session ID, Duration, Validation result, Mismatch.

Exit code: `0` = overall PASS, `1` = FAIL, `2` = misconfigured (no `DATABASE_URL`).

## Extending for other engines

1. Add `tools/shadow-regression/src/engines/<engine>/scenarios.mjs`
2. `registerEngine("<engine>", scenarios)` in `src/run.mjs`
3. Run `SHADOW_REGRESSION_ENGINE=<engine> npm run test:shadow`

Reuse `validate/shadowParity.mjs` or add engine-specific validators that share the same report shape.

## Safety / non-goals

- No production behavior changes
- No SQL logic / wallet / settlement / Platform architecture changes in this phase
- No commit/push from the harness itself
- Harness cleanup cancels synthetic rooms unless `SHADOW_REGRESSION_KEEP_ROOMS=1`

## Related

- [p5-4-shadow-mode.md](../architecture/p5-4-shadow-mode.md)
- [p5-3-bingo-platform-adapter.md](../architecture/p5-3-bingo-platform-adapter.md)
- [tools/shadow-regression/README.md](../../tools/shadow-regression/README.md)
