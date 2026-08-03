# P5.6 — Cutover Risk Register

> READ ONLY · Companion to [p5-6-cutover-readiness.md](./p5-6-cutover-readiness.md)

---

## 1. Risk summary

| ID | Risk | Severity | Likelihood | Cutover impact | Mitigation |
|----|------|----------|------------|----------------|------------|
| R1 | Participant lists missing on Platform | **High** | Certain today | Blocks Stage 3–4 | Implement participant/ticket mirror before lobby cutover |
| R2 | Shadow lag under load | Medium | Medium | Stale lobby/status | Outbox SLO alerts; dual-read compare; reconcile cron |
| R3 | DLQ poison / silent drift | Medium | Low | Missing sessions | Alert on `dead_lettered_at`; harness + reconcile |
| R4 | Premature Platform settle write | **Critical** | Low if gated | Double pay / missed pay | Stage 5A display-only first; idempotent keys |
| R5 | Wallet confused with session cutover | **Critical** | Medium (process) | Balance corruption narrative | Keep wallet on finance RPCs only |
| R6 | Tournament still keyed to Bingo rooms | High | Certain | Stage 4 incomplete | Adapter + `game_session_id` before switch |
| R7 | Feature flag misdefault (Platform on) | High | Low | Instant prod read switch | Default off; config review |
| R8 | Harness ≠ production mix | Medium | Medium | False confidence | Prod soak metrics; expand scenarios |
| R9 | Soft participant harness noise | Low | Certain | Alert fatigue | Keep soft until mirror; then hard-fail |
| R10 | Rollback after Stage 5B | **Critical** | Low | Hard ledger repair | Avoid 5B until dual-run proven |

---

## 2. Risks by cutover stage

| Stage | Top risks | Residual after mitigation |
|-------|-----------|---------------------------|
| 1 Reports | R7, R8 | Low |
| 2 History | R2, R8 | Low–Medium |
| 3 Lobby | R1, R2, R7 | Medium–High until R1 closed |
| 4 Tournament | R1, R6 | High until adapter |
| 5A Display | R2 | Medium |
| 5B Write | R4, R5, R10 | Critical |

---

## 3. Open blockers (must close before expanding cutover)

| Blocker | Owner domain | Evidence |
|---------|--------------|----------|
| No participant shadow | Platform adapter | P5.4 scope; harness soft `participants_*` |
| No production Platform read flag | App | All APIs read Bingo |
| Tournament ↔ session FK not live | Platform + tournament | P5.3 design only |
| Settlement write still monolithic Bingo | Finance | `fn_finish_room_and_settle` MIXED (P5.0) |

---

## 4. Monitoring checklist (pre–Stage 1)

| Signal | Source | Bad threshold (suggested) |
|--------|--------|---------------------------|
| Pending outbox depth | `platform.shadow_outbox` | Sustained &gt; N or age &gt; 60s |
| DLQ count | `dead_lettered_at IS NOT NULL` | Any new row |
| Lifecycle divergence | reconcile query | &gt; 0 for active rooms |
| Mirror error rate | `shadow_mirror_log` result=error | Spike vs baseline |
| Harness | `npm run test:shadow` | Non-zero FAIL |

Prefix: `[PlatformShadow]`

---

## 5. Go / No-Go (risk view)

| Decision | Risk rationale |
|----------|----------------|
| **No-Go** full cutover | R1 + financial SoT + zero Platform read soak in prod apps |
| **Conditional Go** Stage 1 | R1 irrelevant to aggregate reports; R7 mitigated by flag default off |
| **No-Go** Stage 3+ | R1 open |

---

## Related

- [p5-6-cutover-plan.md](./p5-6-cutover-plan.md)
- [p5-4-shadow-mode.md](./p5-4-shadow-mode.md)
- [p5-1-settlement-boundary.md](./p5-1-settlement-boundary.md)
