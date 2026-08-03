# P5.6 — Platform Cutover Readiness Audit

> **Phase:** P5.6 — READ ONLY  
> **Date:** 2026-08-03  
> **Scope:** Go / No-Go for gradual Platform cutover  
> **No SQL, migrations, code, dual-write, or Platform production reads enabled**

Companions:

- [p5-6-cutover-plan.md](./p5-6-cutover-plan.md)
- [p5-6-risk-register.md](./p5-6-risk-register.md)

---

## 1. Executive decision

### **NO-GO for broad cutover**

### **CONDITIONAL GO for Stage 1 only** (non-financial, non-participant admin/ops reports behind a flag)

| Reason | Detail |
|--------|--------|
| Shadow write path healthy | Live DEV: 64/64 rooms mirrored; 0 missing; 0 lifecycle divergence; 0 settlement divergence; outbox 0; DLQ 0 |
| Harness | 15/15 PASS after pool fixture fix |
| Participants | **Not mirrored** by P5.4 — soft failures in harness; production lobby/tournament need ticket/player lists |
| Money | Wallet / settle / commission still Bingo-only SoT; Platform settlement is a **projection** |
| Production reads | **Zero** Platform reads today — cutover would be the first introduction |

Full cutover (lobby / live room / settlement / wallet) is **BLOCKED** until participant shadow + dual-read gates + financial boundary cutover design land.

---

## 2. Component review

| Area | Status | Notes |
|------|--------|-------|
| Platform tables (`games`, `engine_registry`, `game_sessions`, …) | Ready for Stage 1 reads | Schema sufficient for session shell + settlement envelope |
| Shadow sync | Healthy | Trigger → outbox → drain/reconcile cron |
| Outbox | Healthy | Pending 0 at audit time |
| Retry | Designed + exercised | Harness `bingo-retry-shadow` PASS |
| DLQ | Empty | 0 dead letters at audit time |
| Lifecycle parity | Pass | 0 diverged rooms live; harness covers transitions |
| Settlement parity | Pass (projection) | Finished → settled + applied settlement row; **not** money SoT |
| Participants parity | **Fail / incomplete** | P5.4 does not sync tickets → `session_participants` |
| Timestamp parity | Pass for settle projection | `settled_at` / `applied_at` aligned to Bingo `updated_at` on finish |
| Harness coverage | Pass 15/15 | Synthetic + existing-room scenarios; not a substitute for prod soak |
| Rollback capability | Defined for Stage 1–2 | Feature-flag revert to Bingo reads; see plan |

---

## 3. Acceptance criteria checklist

| Criterion | Met? | Explanation |
|-----------|------|-------------|
| ✓ Shadow complete | **Partial** | Room lifecycle + settlement projection complete; **participants not shadowed** |
| ✓ No lifecycle divergence | **True** (DEV snapshot) | 0 diverged among 64 rooms |
| ✓ No settlement divergence | **True** (projection) | 0 settle_div; money still Bingo RPCs |
| ✓ No participant divergence | **False** | No automatic participant mirror; harness soft-fails mismatches |
| ✓ Harness passing | **True** | 15/15 PASS |
| ✓ Rollback defined | **True** | Per-stage in cutover plan |
| ✓ Platform schema sufficient | **Partial** | Sufficient for shell/settlement envelope; insufficient for lobby player lists / Bingo rules |

**Overall acceptance for cutover start beyond Stage 1: NOT MET** (participant gap + financial SoT still Bingo).

---

## 4. Read path inventory (production)

All paths below currently read **Legacy Bingo** (and related finance tables). **None** read `platform.*`.

| Read path | Surface (examples) | Classification | Current source | Recommended first stage | Rollback | Risk |
|-----------|-------------------|----------------|----------------|-------------------------|----------|------|
| Lobby list / snapshot | `/api/player/lobby-snapshot`, lobby UI | **NOT READY** | Legacy Bingo `rooms` | Stage 3 | Flag → Bingo | High |
| Live / game room | `/api/player/gameroom`, `/api/player/live-room` | **BLOCKED** | Legacy Bingo + tickets/draws | Post Stage 4+ (needs engine embeds) | Flag → Bingo | Critical |
| Room status | Embedded in lobby/gameroom/admin | **NOT READY** | Legacy Bingo | Stage 3 (status-only dual-read) | Flag → Bingo | Medium–High |
| Tournament tables | `/api/player/tournament-active-tables`, tournament pages | **NOT READY** | Bingo rooms + tournament_* | Stage 4 | Flag → Bingo | High |
| History / room results | `/api/player/room-results` | **NOT READY** | Bingo `rooms`/`results` | Stage 2 | Flag → Bingo | Medium |
| Admin games report | `/api/admin/games/report` | **SAFE FOR CUTOVER** (Stage 1 candidate) | Bingo `rooms` (+ aggregates) | Stage 1 | Flag → Bingo | Low |
| Settlement display | Room results / settle UIs | **BLOCKED** | Bingo settle + results | Stage 5 | Flag → Bingo; never Platform wallet | Critical |
| Wallet | Wallet APIs / balances | **BLOCKED** | `wallets` / finance RPCs | **Never via session cutover** | N/A — stays Platform finance, not session | Critical |
| Commission | Agent/admin commission reports | **BLOCKED** for session-sourced | `commissions_log` | Later; keep ledger SoT | Flag | High |
| Notifications | Realtime / pushes | **NOT READY** | Bingo events / channels | After Stage 3 | Flag | Medium |
| Dev panel room ops | `/api/dev-panel/*` | **NOT READY** | Bingo | Optional Stage 1 internal | Flag | Low–Medium |
| Engine claim/process | Bingo engine workers | **BLOCKED** | Bingo `rooms` lease | Not a “read cutover” — stays Bingo until engine session API | — | Critical |

### Classification key

| Label | Meaning |
|-------|---------|
| SAFE FOR CUTOVER | May dual-read or switch behind flag with low blast radius |
| NOT READY | Needs more shadow fields / soak / feature work first |
| BLOCKED | Must not cut over until SoT or participant/money prerequisites met |

---

## 5. Per-path detail (required answers)

### Lobby

| | |
|--|--|
| Current source | Legacy Bingo |
| First cutover stage | Stage 3 |
| Rollback | Feature flag `PLATFORM_READ_LOBBY=0` → Bingo snapshot |
| Risk | High (player-facing, capacity, join races) |

### Tournament

| | |
|--|--|
| Current source | Legacy Bingo (+ tournament tables) |
| First cutover stage | Stage 4 |
| Rollback | Flag → prior tournament room queries |
| Risk | High |

### Room status

| | |
|--|--|
| Current source | Legacy Bingo |
| First cutover stage | Stage 3 (status field only) or Stage 1 admin |
| Rollback | Flag |
| Risk | Medium–High |

### History

| | |
|--|--|
| Current source | Legacy Bingo `rooms` / `results` |
| First cutover stage | Stage 2 |
| Rollback | Flag |
| Risk | Medium |

### Reports

| | |
|--|--|
| Current source | Legacy Bingo |
| First cutover stage | **Stage 1** |
| Rollback | Flag |
| Risk | Low |

### Settlement

| | |
|--|--|
| Current source | Legacy Bingo finance RPCs + results |
| First cutover stage | Stage 5 (display from projection first; write path later) |
| Rollback | Immediate flag; ledger unchanged |
| Risk | Critical |

### Wallet

| | |
|--|--|
| Current source | Platform finance tables / RPCs (already), **not** `game_sessions` |
| First cutover stage | **Out of session cutover scope** |
| Rollback | N/A |
| Risk | Critical if wrongly routed through session |

### Commission

| | |
|--|--|
| Current source | `commissions_log` / Bingo ticket keys |
| First cutover stage | After Stage 5 + generalized source refs |
| Rollback | Flag |
| Risk | High |

### Notifications

| | |
|--|--|
| Current source | Bingo / realtime |
| First cutover stage | After Stage 3 |
| Rollback | Flag |
| Risk | Medium |

---

## 6. Live DEV evidence (audit query)

| Metric | Value |
|--------|-------|
| rooms | 64 |
| mirrored sessions | 64 |
| missing | 0 |
| lifecycle divergence | 0 |
| settlement divergence | 0 |
| pending outbox | 0 |
| DLQ | 0 |
| Harness | 15/15 PASS |

---

## 7. What “ready” means here

| Ready now | Not ready |
|-----------|-----------|
| Continue shadow + harness as gate | Switch lobby/gameroom to Platform |
| Stage 1 flagged admin reports | Participant-dependent UX |
| Observe soak / lag SLOs | Settlement write cutover |
| | Tournament lifecycle on Platform |

---

## Related

- [p5-4-shadow-mode.md](./p5-4-shadow-mode.md)
- [p5-5 pool harness fix](../testing/p5-5-pool-constraint-harness-fix.md)
- [p5-3-bingo-platform-adapter.md](./p5-3-bingo-platform-adapter.md)
