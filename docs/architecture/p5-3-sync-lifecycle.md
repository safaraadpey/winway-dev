# P5.3 — Sync Lifecycle

> READ ONLY · Companion to [p5-3-bingo-platform-adapter.md](./p5-3-bingo-platform-adapter.md)

Defines ownership per transition, sync direction, failure policy, and retry strategy for the **mirror phase** (Bingo → Platform only).

---

## 1. Lifecycle diagram

```text
                    BINGO (authoritative)              PLATFORM (projected)
                    ─────────────────────              ─────────────────────
Create room         [Bingo] ───────────────────────► Created
Open / fill         [Bingo] ───────────────────────► Waiting
Claim lease         [Bingo] ───────────────────────► Claimed (+ lease fields)
Start play          [Bingo] ───────────────────────► Running
Play complete       [Bingo] ───────────────────────► Finished
  (settling)
Settle money        [Bingo finance] ───────────────► Settled (+ settlement row)
Archive / retain    [Bingo janitor / Platform] ────► Archived

Cancel              [Bingo] ───────────────────────► Cancelled
```

No arrows Platform → Bingo in this phase.

---

## 2. Ownership per transition

| Transition | Who owns the **decision**? | Who writes Bingo? | Who writes Platform? |
|------------|----------------------------|-------------------|----------------------|
| → Created | **Bingo** | Bingo | Adapter (mirror) |
| → Waiting | **Bingo** | Bingo | Adapter |
| → Claimed | **Bingo** (engine) | Bingo | Adapter |
| Claimed → Waiting (lease lost) | **Bingo** | Bingo | Adapter |
| → Running | **Bingo** | Bingo | Adapter |
| → Finished | **Bingo** | Bingo (`settling` / play end) | Adapter |
| → Settled | **Bingo** finance path (today) | Bingo (`finished`) | Adapter (projection) |
| → Archived | **Both*** | Bingo retention | Adapter or Platform janitor |
| → Cancelled | **Bingo** | Bingo | Adapter |

\* Archive: Bingo (or ops) marks room cold; Platform may archive on its own schedule **after** Bingo terminal state — still one-way data dependence.

| Label | Meaning |
|-------|---------|
| Bingo | Engine/SQL legacy path decides |
| Platform | Platform decides (not used for Bingo control in mirror) |
| Both | Coordination without Platform controlling Bingo |
| Neither | Out of scope / no sync |

**Neither (this phase):** Platform-initiated create/claim/settle for Bingo rooms; two-way status negotiation.

---

## 3. Synchronization points

| Sync point | Direction | Mode | Trigger (Bingo side) | Platform effect |
|------------|-----------|------|----------------------|-----------------|
| Room creation | Bingo → Platform | **One-way** | `INSERT rooms` | Upsert `game_sessions` + `session_state` + event |
| Room waiting | Bingo → Platform | **One-way** | status → `waiting` | status `waiting` |
| Room claim | Bingo → Platform | **One-way** | lease claim RPC/worker | status `claimed` + lease_* |
| Lease renew | Bingo → Platform | **One-way** | lease heartbeat | lease_expires_at |
| Lease release | Bingo → Platform | **One-way** | release / expiry | status `waiting` if not running |
| Game start | Bingo → Platform | **One-way** | status → `playing` | status `running`, `started_at` |
| Game finish | Bingo → Platform | **One-way** | status → `settling` | status `finished`, `finished_at` |
| Settlement | Bingo → Platform | **One-way** | settle RPC success → `finished` | status `settled`, settlement row `applied`, `settled_at` |
| Archive | Bingo → Platform | **One-way** | retention / idle cold | status `archived` |
| Cancel | Bingo → Platform | **One-way** | status → `cancelled` | status `cancelled` |

| Mode | Meaning |
|------|---------|
| One-way | Projection only; Bingo does not read Platform to proceed |
| Two-way | **Not used** in mirror phase |
| Platform → Bingo | **Forbidden** until a later control-plane phase |

---

## 4. Failure handling

**Principle:** Platform mirror is **best-effort relative to play**, **mandatory relative to eventual consistency**. Bingo never blocks on Platform.

| Case | Bingo stop? | Retry? | Queue? | Ignore? |
|------|-------------|--------|--------|---------|
| Platform create fails after room insert | **No** | **Yes** | **Yes** (outbox) | No |
| Platform status update fails (waiting/claim/running) | **No** | **Yes** | **Yes** | No |
| Platform update fails at finish | **No** — settle Bingo as today | **Yes** | **Yes** | No |
| Platform update fails after settle | **No** — money already correct in ledger | **Yes** | **Yes** | No |
| Platform down for hours | **No** | **Yes** with backoff | **Yes** | No |
| Poison message (FK / schema bug) | **No** | Limited | DLQ | After DLQ + alert, ops fix — not silent ignore forever |
| Platform rejects invalid transition | **No** | Recompute from Bingo snapshot | **Yes** | No |

### Should Bingo stop?

**Never** for Platform projection failures during mirror phase.

### Should it retry?

**Yes** — at-least-once delivery to Platform with idempotent upserts.

### Should it queue?

**Yes** — transactional outbox (or equivalent) in the **same DB transaction as the Bingo state change** when dual-write is later enabled:

```text
1. UPDATE rooms …
2. INSERT adapter_outbox (room_id, target_status, version, …)
3. COMMIT
4. Worker applies to platform.* (idempotent)
```

Design-only in P5.3 — do not implement yet.

### Should it ignore?

**No** as a default. Ignoring creates permanent drift. Only drop after DLQ + human decision.

---

## 5. Retry strategy

| Parameter | Recommendation |
|-----------|----------------|
| Delivery | At-least-once |
| Backoff | Exponential with jitter (e.g. 1s → 5m cap) |
| Ordering | Per `room_id` FIFO (single worker partition or `FOR UPDATE` on outbox row) |
| Idempotency | Shared UUID + status monotonicity + settlement_key |
| Replay | Worker may rebuild desired Platform state from Bingo snapshot (reconcile) |
| Poison | Max attempts → DLQ table + metric `[PlatformAdapter]` |
| Lag SLO | Soft (e.g. p99 < 30s); not gameplay-critical |

### Reconcile (stronger than event replay)

Periodic job:

```text
FOR rooms in active/terminal set:
  desired = map(room)
  IF session missing OR drifted → upsert session
```

Reconcile heals missed outbox events without Bingo changes.

---

## 6. Settlement-specific rules

| Rule | Detail |
|------|--------|
| Money SoT | Existing Bingo settle / wallet RPCs only |
| Platform settlement row | Written **after** Bingo settle succeeds (or in outbox after) |
| If Platform settlement insert fails | Bingo room already `finished` — queue mirror; **do not** re-run settle |
| Duplicate settle mirror | Idempotent on `settlement_key = bingo.settle:<room_id>` |

---

## 7. Observability (design)

Stable log/metric prefix (future): `[PlatformAdapter]`

Log: room_id, target status, attempt, outcome, lag_ms.  
Alert: outbox depth, DLQ depth, reconcile repair rate.

---

## 8. Compatibility

Enabling this design later must preserve:

- Identical Bingo RPC behavior  
- Identical API responses  
- Identical settlement amounts and timing  

Adapter runs **beside** Bingo, not inside the money path.

---

## Related

- [p5-3-session-mapping.md](./p5-3-session-mapping.md)  
- [p5-3-backfill-strategy.md](./p5-3-backfill-strategy.md)  
- [p5-1-settlement-boundary.md](./p5-1-settlement-boundary.md)  
