# Ding System — System Reality Map

> Last aligned with codebase: 2026-06. Documents what is implemented today in
> DB, game-engine, API, and player UI.

## What Ding is

Ding is a **secondary point balance** separate from the money wallet (`wallets`).
During live bingo play, players earn ding when a drawn number appears on their
cards. Balances live in `ding_balances`; the audit log is `ding_transactions`.

Room-play ding flow **only credits** (no spend/redeem in the core live-room path).
Tournaments may use ding as entry currency (`entry_currency = 'DING'`,
`fn_burn_ding_locks`) — see [Tournament + DING](#tournament--ding).

---

## Data model

| Object | Role |
| --- | --- |
| `ding_balances(user_id, balance, locked_amount, …)` | Current ding per user. Seeded at signup. |
| `ding_transactions(…)` | Credit log; engine path writes **one aggregated row per user per draw** (`ticket_id = NULL`). |
| `room_templates.ding_per_number` | Template default multiplier (typically `1`). |
| `rooms.ding_per_number` | Optional per-room override. |
| `draws.processed_at` | Draw fully processed by engine. |
| `draws.ding_aggregated_at` | Idempotency lock — ding for this draw already applied. |

### Credit formula (authoritative)

```
ding_per_card = COALESCE(room.ding_per_number, template.ding_per_number, 1)   -- truncated to int in engine

matched_cards(user) = count of that user's tickets where:
  - cancelled_at IS NULL
  - reservation_status = 'reserved'
  - card contains draws.number (via marks / card_numbers)

delta(user) = matched_cards × ding_per_card   (only if delta > 0)
```

**Cash rooms:** tickets stay `reserved` during play → eligible for ding.

**Tournament rooms:** tickets are often created as `confirmed` → **engine credits
zero** for those tickets under current rules.

---

## Authoritative path: Game Engine (production)

The DB trigger path is **disabled** to avoid double-credit:

- Migration: `sql/migrations/20250610130000_disable_ding_trigger_for_engine.sql`
- `ALTER TABLE public.draws DISABLE TRIGGER trg_aggregate_ding_on_processed_at`

### End-to-end server flow

```
1. Room actor / draw loop inserts draws row + draw_jobs row
2. Game engine: processEngineDrawJob
      → applyMarksAndEvaluateWithState (marks + winner eval in memory)
      → prepareDingCreditsFromState (apps/engines/bingo/src/domain/ding)
      → finalizeEngineDrawJob RPC
3. rpc_finalize_engine_draw_job (single transaction):
      → persist marks + results
      → set draws.processed_at
      → rpc_apply_ding_credits_for_draw
      → set draws.ding_aggregated_at
4. ding_balances.balance += delta; ding_transactions inserted
```

### Key engine files

| File | Role |
| --- | --- |
| `apps/engines/bingo/src/domain/draw/processEngineDrawJob.ts` | Orchestrates mark/eval/ding/finalize |
| `apps/engines/bingo/src/domain/ding/index.ts` | `prepareDingCreditsFromState`, DB fallback `aggregateDingForDraw` |
| `apps/engines/bingo/src/core/ding.ts` | Port of aggregation rules (`computeDingCredits`, `resolveDingPerCard`) |
| `apps/engines/bingo/src/state/room-state.ts` | `countDingMatchedByUser` — **reserved tickets only**, from marks |
| `apps/engines/bingo/src/repositories/index.ts` | `applyDingCreditsForDraw` → `rpc_apply_ding_credits_for_draw` |

### Timing

Ding is credited **when the draw job is finalized**, not when the draw row is
first inserted. Client UI may reveal the number on a paced queue (`draw_interval_sec`)
before or after this moment.

---

## Legacy DB trigger path (disabled, reference only)

### `fn_aggregate_ding_for_processed_draw()` — `trg_aggregate_ding_on_processed_at`

- Fires `AFTER UPDATE ON draws` when `processed_at` goes NULL → NOT NULL.
- Same aggregation rules as engine (`reserved` tickets, `ding_per_card` COALESCE).
- **Not active** while engine mode is on — do not re-enable without removing engine ding.

### `distribute_ding_on_draw()` — legacy per-ticket

- Older per-ticket loop; wider ticket statuses in some migrations.
- **Not** the wired production trigger; kept for historical reference.

---

## Client: balance display and live-room UX

The player UI does **not** subscribe to `ding_balances` realtime. It uses a
**local optimistic accumulator** during live play and refreshes from the API at
boundaries.

### Architecture

```
BalancesProvider (useBalances)
  → PlayerLayoutClient → MergedPlayerHeader (dingBalance, isAnimating)

LiveRoomScreen
  → reveal queue → handleNewDraw → creditDingForRevealedNumber
  → creditDingOnReveal (useBalances)
```

### Hydration and sync points

| When | Source |
| --- | --- |
| App load / auth | `GET /api/me/ding-balance` via `useBalances.fetchBalances` |
| During live room | Local `currentBalanceRef += delta` per revealed number |
| Room finished (`settling` / `finished`) | `refreshAllBalances()` in `LiveRoomScreen` |
| Manual refresh in header | `refreshAllBalances` |
| Full page reload | API hydration again |

### Live-room client calculation (`LiveRoomScreen`)

On each **UI reveal** (not necessarily server finalize time):

1. Count `is_my_card` cards whose grid contains the drawn number.
2. `delta = matchedCards × snapshot.room.ding_per_number` (defaults to `1` if null).
3. Call `creditDingOnReveal(\`${roomId}:${number}\`, delta)`.

`useBalances.creditDingOnReveal`:

- Dedupes by `revealKey`.
- Adds `delta` to `currentBalanceRef`.
- After 400 ms: updates React state, plays ding tone (if enabled), runs header animation.

### API: resolved `ding_per_number` for room snapshot

`GET /api/player/live-room` resolves:

```typescript
room.ding_per_number ?? template.ding_per_number ?? 1
```

and sends it on `room.ding_per_number`. Client should use this resolved value (it does via snapshot).

---

## Known client vs server discrepancies

| Topic | Server (engine) | Client (live UI) |
| --- | --- | --- |
| Eligible tickets | `reserved` only | All `is_my_card` in snapshot |
| Tournament tables | Often `confirmed` → 0 ding | May still show optimistic ding |
| `ding_per_number` | room → template → 1 | Uses snapshot field (resolved on full snapshot load) |
| Timing | On job finalize | On paced UI reveal |
| Source of truth at end | `ding_balances` in DB | `refreshAllBalances` realigns |

If UI balance after a game differs from balance after page refresh, compare
`ding_transactions` for the room against what the client counted.

---

## HTTP / RLS surface

| Endpoint / access | Purpose |
| --- | --- |
| `GET /api/me/ding-balance` | Authenticated user's balance |
| `lib/features/ding/ding.ts` | Client helpers (`getMyDingBalance`, transactions, stats) |
| `ding_balances` RLS | User reads/updates own row |
| `ding_transactions` RLS | User reads own rows |

Realtime subscription on `ding_balances` was **removed** from the player shell;
see comment in `lib/features/ding/ding.ts` and `useBalances.ts`.

---

## Tournament + DING

- Tournament entry can use `meta.entry_currency = 'DING'`.
- `fn_burn_ding_locks` / ding locks apply to tournament lifecycle — separate from
  per-draw room credits.
- Tournament game rooms create tickets with `confirmed` status → current engine
  ding rules may credit **no** per-draw ding unless eligibility rules change.

See also: `docs/backend/supabese/tournament_dingmoney_architecture.md`.

---

## Troubleshooting

### No ding on server for a draw

1. Confirm draw finalized: `draws.processed_at` and `ding_aggregated_at` set.
2. Ticket status: engine requires `reservation_status = 'reserved'`.
3. Check aggregation row:

   ```sql
   SELECT * FROM ding_transactions
   WHERE room_id = :room_id AND drawn_number = :number
   ORDER BY created_at DESC;
   ```

4. Engine logs: `ding aggregated (engine)` in draw processor output.

### UI shows ding but DB does not

- Client counts all `is_my_card` hits; server may exclude non-`reserved` tickets.
- Optimistic balance until `refreshAllBalances` or page reload.

### Double credit

- Do **not** enable `trg_aggregate_ding_on_processed_at` while engine calls
  `rpc_apply_ding_credits_for_draw` in the same finalize path.

---

## Related docs

- `DING_SYSTEM.md` — Persian overview for product/dev (points here for details).
- `docs/system-map/event-flows.md` — draw → ding in event chain.
- `docs/system-map/game-engine-reality.md` — engine draw pipeline.
- `docs/migration/migration-progress-audit.md` — D1 ding trigger vs engine status.
