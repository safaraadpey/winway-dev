# P5.9 — Cancelled Session Report Projection Fix

> **Date:** 2026-08-03  
> **Scope:** Admin Stage 1 report mapping only (`lib/platformReports/platformSessionsReport.ts`)  
> **Not changed:** Platform stored timestamps, Shadow data, Bingo lifecycle, wallet / settlement / tournament, platform tables

## Change

For Platform report rows with `status === "cancelled"`:

| Field | Report value |
|-------|----------------|
| `startedAt` | `null` |
| `finishedAt` | `null` |
| `settledAt` | `null` |

`createdAt` and all other fields unchanged. Stored `platform.game_sessions.started_at` / `finished_at` / `settled_at` remain as mirrored by Shadow.

This matches the Legacy contract in `fetchLegacySessionsReport` (cancelled → no lifecycle timestamps).

## Validation (three modes)

Period: current calendar month. Tool: `tools/shadow-regression/scripts/p5-8-full-validate.mjs` (Platform path updated with same projection rule).

| Mode | Result | Notes |
|------|--------|-------|
| **legacy** | **PASS** | `totalCount=37`, no errors |
| **compare** | **PASS** | Response source = legacy; `mismatchCount=0`; no exceptions |
| **platform** | **PASS** | Served from `platform.game_sessions` + `session_participants`; matches Legacy |

### Compare log

```
[PlatformReports] compare {"mismatchCount":0,"rowCountMatch":true,"legacyTotal":37,"platformTotal":37,"missingOnPlatform":[],"missingOnLegacy":[],"statusMismatches":[],"participantCountMismatches":[],"amountMismatches":[],"timestampMismatches":[],"participantDetailMismatches":[]}
```

### Parity checklist

| Field class | Match |
|-------------|-------|
| Session counts | yes |
| Statuses | yes |
| Participants | yes |
| Amounts | yes |
| Timestamps | yes (`mismatchCount=0`) |

## Side effects

| Check | Result |
|-------|--------|
| Cancelled rows still have stored TS on Platform | yes (`cancelled_with_stored_ts=27` — store not cleared) |
| Participant recon | PASS (missing/dup/status/amount/ts/dlq/pending = 0) |
| Session coverage | PASS (rooms = bingo sessions, missing = 0) |
| Default flag | **legacy** (no `PLATFORM_REPORTS_SOURCE` in `.env.local`) |
| Wallet / settlement / tournament | untouched |

## Rollback

Unset or set `PLATFORM_REPORTS_SOURCE=legacy` — default path unchanged until operators explicitly enable `compare` / `platform`.

---

P5_9_STAGE1_PARITY_RESTORED
