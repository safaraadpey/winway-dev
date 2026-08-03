# P5.10 — History & Analytics Validation

> **Date:** 2026-08-03  
> **Scope:** Stage 2 history + analytics (data-path parity)  
> **Script:** `node tools/shadow-regression/scripts/p5-10-validate-history.mjs`  
> **Production Stage 2 switch:** **not** performed

## Selected paths validated

1. History list (terminal statuses) — equivalent to `GET /api/admin/platform-sessions/history`
2. Analytics summary — equivalent to `GET /api/admin/platform-sessions/analytics`

## Mode results

| Path | legacy | compare | platform |
|------|--------|---------|----------|
| History | **PASS** (`totalCount=37`) | **PASS** (`mismatchCount=0`, return Legacy) | **PASS** (parity) |
| Analytics | **PASS** | **PASS** (`mismatchCount=0`) | **PASS** |

### Analytics snapshot (month window)

| Metric | Legacy | Platform |
|--------|-------:|---------:|
| sessionCount | 37 | 37 |
| participantCount | 48 | 48 |
| amountTotal | 675000 | 675000 |
| cancelled | 31 | 31 |
| settled | 6 | 6 |

### Compare logs

```
[PlatformHistory] history compare {"mismatchCount":0,"legacyTotal":37,"platformTotal":37}
[PlatformHistory] analytics compare {"mismatchCount":0,...}
```

## Parity checklist

| Check | Result |
|-------|--------|
| Row / session count | PASS |
| Session IDs | PASS |
| gameSlug (`bingo`) | PASS |
| Lifecycle status | PASS |
| Participant count / status / amounts | PASS |
| Timestamps (+ cancelled null projection) | PASS |
| No 5xx in data path exercise | PASS |
| Platform mode fallback | N/A (direct readers; route returns 503 on failure by design) |

## Side effects

| Check | Result |
|-------|--------|
| Shadow / participant recon | **PASS** (missing/dup/status/amount/ts/dlq/pending = 0; 77/77) |
| Wallet | untouched |
| Tournament | untouched |
| Lobby / live | untouched |
| Settlement | untouched |

## Flag state

| Flag | Intended default | Stage 2 Production |
|------|------------------|--------------------|
| `PLATFORM_HISTORY_SOURCE` | `legacy` | **leave legacy** |
| `PLATFORM_REPORTS_SOURCE` | (Stage 1) | unchanged (`platform` on winway-dev) |

## Rollback

Set `PLATFORM_HISTORY_SOURCE=legacy` (or unset).

## Next (not done)

1. Deploy Stage 2 routes to winway-dev  
2. Run HTTP three-mode checks with admin Bearer  
3. Optional `compare` soak, then explicit Production flip

Artifact: `docs/testing/p5-10-history-analytics-validation-raw.json`

---

P5_10_HISTORY_ANALYTICS_READY_FOR_TEST
