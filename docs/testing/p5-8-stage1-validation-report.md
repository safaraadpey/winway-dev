# P5.8 — Stage 1 Read Cutover Validation Report

> **Date:** 2026-08-03  
> **Scope:** `GET /api/admin/platform-sessions/report` only  
> **Method:** Live DEV data path exercise (Legacy = `rooms`+`tickets`, Platform = `platform.game_sessions`+`platform.session_participants`) + shadow recon + `npm run test:shadow`  
> **Production behavior:** unchanged (flag default remains `legacy`; no SQL/app edits for fix)

## Verdict

| Area | Result |
|------|--------|
| **Overall Stage 1 platform cutover** | **FAIL** |
| Legacy mode | **PASS** |
| Compare mode (serve + log + no throw) | **PASS** (operational) |
| Compare mode (zero mismatches) | **FAIL** |
| Platform mode (serve from platform.*) | **PASS** (provenance) |
| Platform mode (full parity vs Legacy) | **FAIL** |
| Shadow / participant health | **PASS** |
| Wallet / Tournament / Settlement impact | **PASS** (none) |
| Rollback (`PLATFORM_REPORTS_SOURCE=legacy`) | **PASS** |

**Blocker for `platform` mode GO:** cancelled sessions retain `started_at` / `finished_at` / `settled_at` on Platform while Legacy projection nulls those fields for `cancelled`. Counts, statuses, amounts, and participant details match.

---

## 1. Legacy (`PLATFORM_REPORTS_SOURCE=legacy`)

| Check | Result |
|-------|--------|
| Report loads | PASS |
| Data shape valid | PASS |
| Errors / exceptions | none |
| Month sample | `totalCount=24`, `itemCount=24` |

Sample row: cancelled session, `participantCount=0`, `amountTotal=0`.

---

## 2. Compare (`PLATFORM_REPORTS_SOURCE=compare`)

| Check | Result |
|-------|--------|
| Response source | **legacy** (as designed) |
| Platform comparison executes | PASS |
| `[PlatformReports]` logs generated | PASS |
| Exceptions | none |
| Mismatch count | **48** → FAIL zero-mismatch gate |

### Collected `[PlatformReports]` logs

```
[PlatformReports] compare {"mismatchCount":48,"rowCountMatch":true,"legacyTotal":24,"platformTotal":24,"missingOnPlatform":[],"missingOnLegacy":[],"statusMismatches":[],"participantCountMismatches":[],"amountMismatches":[],"timestampMismatches":[...48 entries — startedAt/finishedAt/settledAt where legacy=null platform=ISO...],"participantDetailMismatches":[]}
```

Full captured log: `docs/testing/p5-8-stage1-validation-raw.json` → `platformReportsLogs`.

---

## 3. Platform (`PLATFORM_REPORTS_SOURCE=platform`)

| Check | Result |
|-------|--------|
| Served from `platform.game_sessions` | PASS |
| Served from `platform.session_participants` | PASS |
| Session count vs Legacy | PASS (`24` / `24`, `rowCountMatch=true`) |
| Participant counts | PASS (`0` count mismatches) |
| Statuses | PASS (`0` status mismatches) |
| Amounts | PASS (`0` amount mismatches) |
| Participant detail | PASS (`0` detail mismatches) |
| Timestamps | **FAIL** (`48` mismatches) |

Month provenance: `24` bingo sessions in window; `53` participant rows joined for those sessions.

---

## Mismatch summary

| Category | Count |
|----------|------:|
| Missing on Platform | 0 |
| Missing on Legacy | 0 |
| Status | 0 |
| Participant count | 0 |
| Amount | 0 |
| Participant detail | 0 |
| **Timestamp** | **48** |
| **Total mismatchCount** | **48** |

**Root cause (observed, not fixed):**  
For `status=cancelled`, Legacy report sets `startedAt`/`finishedAt`/`settledAt` to `null`. Platform stores and returns historical timeline columns (16 cancelled sessions in DB still have started/finished/settled stamps). Compare correctly flags presence mismatches (`null` vs ISO).

No missing sessions, no status/amount/participant drift.

---

## Performance observations

| Path | Latency (this run) |
|------|-------------------:|
| Legacy (rooms+tickets aggregate) | ~2637 ms |
| Platform (platform.* only) | ~532 ms |
| Compare (in-memory diff) | ~1 ms |

Platform read ~5× faster than Legacy page build on this sample. Compare adds negligible CPU; cost is the extra Platform fetch when flag=`compare`.

---

## Regression / side-effect checks

| Check | Result |
|-------|--------|
| Shadow session coverage | PASS — `64` rooms / `64` bingo sessions / `0` missing |
| Participant recon (`fn_shadow_participant_recon_report`) | PASS — missing/dup/status/amount/ts = 0; DLQ = 0; pending outbox = 0 |
| Outbox | PASS — pending `0`, dead `0`, processed `241` |
| `npm run test:shadow` | **PASS** — 15/15 |
| Wallet impact | none (read-only report path) |
| Tournament impact | none |
| Settlement impact | none |

---

## Rollback verification

| Action | Result |
|--------|--------|
| Set `PLATFORM_REPORTS_SOURCE=legacy` (or omit) | Serves Legacy only |
| No SQL / deploy required | Confirmed by `getPlatformReportsSource()` default |
| Invalid flag → legacy + warn | Implemented in `lib/platformReports/config.ts` |
| Compare always returns Legacy on mismatch | Confirmed in route |

**Rollback status: PASS**

---

## Mode scorecard (requested gates)

| Mode | PASS/FAIL | Notes |
|------|-----------|-------|
| Legacy | **PASS** | Safe default |
| Compare | **FAIL*** | *Operational OK; data parity FAIL on timestamps |
| Platform | **FAIL** | Provenance OK; timestamps vs Legacy FAIL |

---

## Recommendation (no code changed)

Keep production/default on **`legacy`**.  
Do **not** enable `platform` until cancelled-session timestamp projection is aligned (either Legacy exposes Platform timeline, or Platform report nulls timeline fields for `cancelled` to match Legacy).  
`compare` remains useful for monitoring; expect timestamp noise until fixed.

Artifacts:

- `docs/testing/p5-8-stage1-validation-raw.json`
- `tools/shadow-regression/scripts/p5-8-full-validate.mjs`
- `tools/shadow-regression/reports/latest.md` (15/15 PASS)

---

P5_8_STAGE1_READ_CUTOVER_VALIDATED
