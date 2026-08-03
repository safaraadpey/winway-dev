# P5.1 — Game Lifecycle

> READ ONLY · Conceptual · Companion to [p5-1-platform-session-model.md](./p5-1-platform-session-model.md)

Every engine shares **one** Platform lifecycle. Engines may use richer internal phases; those map into these statuses and must not invent a second wallet lifecycle.

---

## 1. Canonical statuses

| Status | Meaning (Platform) | Who typically advances |
|--------|--------------------|------------------------|
| **Created** | Session row exists; not open for play yet | Platform / admin / tournament scheduler |
| **Waiting** | Accepting participants / fills / readiness | Platform join path + engine readiness hooks |
| **Claimed** | An engine instance holds the lease and may advance play | Engine (`claimRoom`) |
| **Running** | Play is in progress under engine rules | Engine (`processGame`) |
| **Finished** | Play complete; no more rule transitions; money not yet final | Engine (declares play over) |
| **Settled** | Platform ledger applied for this session’s settlement | Platform (`settle` path) |
| **Archived** | Cold / retained; no further mutations except audit | Platform janitor / retention |

Optional terminal siblings (same family, document if used):

| Status | When |
|--------|------|
| **Cancelled** | Aborted before Running (or before money moves); holds released |
| **Failed** | Unrecoverable orchestration error; requires ops / compensating settle |

Prefer **Cancelled** / **Failed** as explicit terminals rather than overloading **Archived**.

---

## 2. State diagram

```text
                    ┌──────────┐
                    │ Created  │
                    └────┬─────┘
                         │ open / publish
                         ▼
                    ┌──────────┐
              ┌────►│ Waiting  │◄──── re-open policy (rare)
              │     └────┬─────┘
              │          │ engine claims lease
              │          ▼
              │     ┌──────────┐
              │     │ Claimed  │──── lease lost / release ──► Waiting
              │     └────┬─────┘
              │          │ first authoritative play step
              │          ▼
              │     ┌──────────┐
 cancel early │     │ Running  │
              │     └────┬─────┘
              │          │ engine: no further play
              │          ▼
              │     ┌──────────┐
              │     │ Finished │
              │     └────┬─────┘
              │          │ platform settlement success
              │          ▼
              │     ┌──────────┐
              │     │ Settled  │
              │     └────┬─────┘
              │          │ retention
              │          ▼
              │     ┌──────────┐
              └────►│ Archived │  (also from Cancelled after cleanup)
                    └──────────┘
```

**Claimed** may be modeled as a **lease attribute** on Waiting/Running rather than a stored status. Either is valid; pick one in implementation and keep it consistent. This design treats **Claimed** as a first-class status for clarity with the engine contract.

---

## 3. Transition rules (Platform-enforced)

| From | To | Guard |
|------|----|-------|
| Created → Waiting | Template enabled; game_code registered |
| Waiting → Claimed | Engine registered for `game_code`; lease free or stealable |
| Claimed → Waiting | Lease expired / released **and** play not yet irreversible |
| Claimed → Running | Engine persists first Running marker + bumps `state_version` |
| Running → Finished | Engine asserts terminal play; no open engine-critical jobs |
| Finished → Settled | Idempotent settlement applied (or no-op settle if zero money) |
| * → Cancelled | Allowed only if settlement not applied; holds released |
| Settled / Cancelled → Archived | Retention policy |

**Forbidden**

- Running → Settled without Finished (unless explicit single-step settle protocol documented per game — default forbid)
- Settled → Running
- Any status → Settled without Platform ledger path
- Skipping Finished when prizes/holds exist

---

## 4. Money alignment

| Lifecycle | Money |
|-----------|-------|
| Created / Waiting | Optional holds on join |
| Claimed / Running | Holds remain; no prize payout yet |
| Finished | Settlement **eligible** |
| Settled | Ledger final for this settlement key |
| Cancelled | Compensating release / refund holds |
| Archived | Immutable financially |

Detail: [p5-1-settlement-boundary.md](./p5-1-settlement-boundary.md).

---

## 5. Engine-internal phases (examples — not Platform statuses)

Engines may nest phases **inside** Running (or Waiting):

| Game | Internal (examples) | Maps to Platform |
|------|---------------------|------------------|
| Bingo | waiting fill → drawing → line claimed → full house | Waiting / Running / Finished |
| Backgammon | opening roll → move → cube → match over | Running → Finished |
| Poker | blinds → streets → showdown | Running → Finished |
| Roulette | place bets → no more bets → spin → pay | Waiting/Running → Finished |

Platform UIs may show engine phase via **engine snapshot embed**, not by extending the Platform enum with `drawing` / `flop` / `spinning`.

---

## 6. Lease vs status

| Concept | Role |
|---------|------|
| Status | Business lifecycle visible to Platform, tournaments, admin |
| Lease | Which engine replica may call `processGame` |

A session in **Running** without a live lease is a **janitor** concern (reclaim or fail), not a new status.

---

## 7. Tournament interaction

Tournament framework advances brackets using Platform statuses:

- Create child `game_sessions` in **Created** / **Waiting**
- Treat **Settled** (or **Finished** + confirmed zero-money) as match completion for progression
- Do **not** key progression off Bingo `results.win_type`

---

## 8. Idempotency

Every transition that touches money or lease steal must be safe to retry:

- Status updates guarded by `WHERE status = expected`
- Settlement unique on `(session_id, settlement_key)`
- Lease steal requires epoch / fencing token

---

## 9. Non-goals

- Implementing enum types or CHECK constraints now  
- Mapping every current Bingo `room_status` value 1:1 (compatibility mapping is a later migrate task)  
- Encoding Bingo draw clock into Platform lifecycle  
