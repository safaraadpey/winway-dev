# P5.6 — Recommended Cutover Plan

> READ ONLY recommendation. **Do not implement in this phase.**

Basis: [p5-6-cutover-readiness.md](./p5-6-cutover-readiness.md)

---

## 1. Principles

1. Bingo remains write SoT until a stage explicitly flips writes (none of Stages 1–4).
2. Every stage is behind a **feature flag**; default off.
3. Dual-read compare (Bingo vs Platform) for ≥ soak window before switching primary read.
4. Wallet / settle **writes** never move in Stages 1–4.
5. Participant shadow must land before Stage 3 player-facing lobby.

---

## 2. Recommended stage order

```text
Stage 1  Read-only admin/ops reports (non-participant)
Stage 2  History / completed-room summaries
Stage 3  Lobby + room status (after participant mirror)
Stage 4  Tournament lifecycle reads
Stage 5  Settlement display (projection) → later settle orchestration
```

---

## 3. Stage details

### Stage 1 — Read-only reports

| | |
|--|--|
| Scope | Admin games report / internal dashboards: session counts, status aggregates from `platform.game_sessions` |
| Not in scope | Player lobby, wallet, settle writes, tournament seating |
| Prerequisites | Shadow healthy; harness green; flag `PLATFORM_READ_REPORTS` |
| Dual-read | Optional compare Bingo room counts vs Platform for 7 days |
| Go criteria | Lag p99 acceptable; 0 DLQ spike; report parity within tolerance |

**Rollback**

| | |
|--|--|
| Max rollback time | **&lt; 5 minutes** (flag flip + deploy/config) |
| Required action | Set flag off; clients read Bingo again |
| Risk | Low — display-only |

---

### Stage 2 — History

| | |
|--|--|
| Scope | `/api/player/room-results` and similar completed-session history from Platform session + Bingo `results` embed still allowed |
| Prerequisites | Stage 1 stable; finished rooms 100% mirrored |
| Go criteria | Historical id parity; settlement projection present for finished |

**Rollback**

| | |
|--|--|
| Max rollback time | **&lt; 5–15 minutes** |
| Required action | Flag off → Bingo history queries |
| Risk | Medium — player-visible history |

---

### Stage 3 — Lobby state / room status

| | |
|--|--|
| Scope | Lobby snapshot room list + status from `game_sessions`; **join still Bingo** |
| Prerequisites | **Participant (or ticket) mirror or hybrid read**; shadow soak; no lifecycle divergence for 14 days |
| Go criteria | Lobby counts match Bingo; no join breakage |

**Rollback**

| | |
|--|--|
| Max rollback time | **&lt; 5 minutes** (flag) |
| Required action | Flag off immediately; monitor joins |
| Risk | High |

**Blocked today:** participant parity false.

---

### Stage 4 — Tournament lifecycle

| | |
|--|--|
| Scope | Tournament active tables / round room status via `game_sessions` + tournament framework FKs |
| Prerequisites | Stage 3; nullable `game_session_id` wiring design (P5.3); tournament adapter |
| Go criteria | Bracket progression still driven by Bingo completion until Stage 5 |

**Rollback**

| | |
|--|--|
| Max rollback time | **&lt; 15–30 minutes** (flag + verify brackets) |
| Required action | Flag off; tournament queries use `rooms` again |
| Risk | High |

---

### Stage 5 — Settlement

| | |
|--|--|
| Scope A (safer) | **Read** settlement envelope / display from `session_settlement`; writes still Bingo `fn_finish_room_and_settle` |
| Scope B (later) | Split settle: Bingo prize lines → Platform apply ledger (P5.1 boundary) |
| Prerequisites | Stages 1–4 stable; financial idempotency review; never block Bingo settle on Platform |

**Rollback**

| | |
|--|--|
| Max rollback time | Scope A: **&lt; 5 minutes** flag; Scope B: **hours** (ledger compensating txns if mis-applied) |
| Required action | A: flag off display path; B: disable new settle path, keep Bingo settle, reconcile |
| Risk | A Medium; B **Critical** |

---

## 4. Explicit non-stages (do not schedule early)

| Item | Why |
|------|-----|
| Wallet balance cutover via sessions | Wallet already Platform finance; unrelated to session shell |
| Engine claim on `game_sessions` only | Bingo engine still owns lease on `rooms` |
| Deleting `rooms` | Years away; shadow coexist |

---

## 5. Rollback matrix (summary)

| Stage | Max rollback time | Action | Risk |
|-------|-------------------|--------|------|
| 1 Reports | &lt; 5 min | Flag off | Low |
| 2 History | &lt; 15 min | Flag off | Medium |
| 3 Lobby | &lt; 5 min | Flag off + watch joins | High |
| 4 Tournament | &lt; 30 min | Flag off + bracket check | High |
| 5A Settlement display | &lt; 5 min | Flag off | Medium |
| 5B Settlement write | Hours / ops | Revert path + ledger reconcile | Critical |

---

## 6. Suggested gates before Stage 1 implementation (future)

- [ ] 14-day shadow: missing=0, lifecycle_div=0, dlq=0 (prod-like env)
- [ ] Harness in CI or scheduled `npm run test:shadow`
- [ ] Feature flag plumbing (no Platform default)
- [ ] Runbook: outbox depth, DLQ, reconcile lag alerts `[PlatformShadow]`

## 7. Suggested gates before Stage 3

- [ ] Participant (or roster) shadow implemented and harness hard-checks green
- [ ] Dual-read lobby diff dashboard
- [ ] Load test join path unchanged

---

## 8. Decision line

| Question | Answer |
|----------|--------|
| Start Stage 1 engineering next? | **Yes, conditionally** (flagged, read-only reports) |
| Start Stage 3+ now? | **No** |
| Full Platform SoT cutover now? | **No-Go** |
