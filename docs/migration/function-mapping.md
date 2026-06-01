# Function Mapping (DB → Game Engine)

> For every migrated behavior: original DB location, purpose, inputs, outputs,
> side effects, and the new engine implementation location. Decisions:
> **MOVE** (logic ported to TS), **WRAP** (engine calls the DB RPC),
> **KEEP** (stays in DB; math mirrored in TS for parity).
>
> Verified against the live DB (`pg_get_functiondef`) on 2026-05-31.

---

## A. Game core / draw lifecycle

### A1. `game_core.fn_manage_waiting_rooms(p_limit int, p_capture bool)` — **MOVE**
- **Purpose**: promote due `waiting` rooms that reached `min_players` to
  `playing` and schedule the first draw; extend countdown for rooms that did not.
- **Inputs**: `p_limit` (batch size), `p_capture` (no-op, capture disabled).
- **Outputs**: rows `(room_id, became_live_at, paid_players)`.
- **Side effects**: `UPDATE rooms` → `status='playing'`, `next_draw_at = now()+10s`
  (first-draw delay); for under-min rooms `starts_at = now() + countdown_sec`
  (default 120). Distinct active players counted from `tickets` with
  `reservation_status IN ('reserved','confirmed')`; `min_players` default 1.
- **Engine**: `domain/room/index.ts` → `manageWaitingRooms()` (constants
  `FIRST_DRAW_DELAY_SEC=10`, `DEFAULT_COUNTDOWN_SEC=120`).

### A2. `game_core.fn_manage_room_live_actions()` — **MOVE**
- **Purpose**: draw the next number for each due `playing` room.
- **Inputs**: none (scans `rooms` where `status='playing'` and `next_draw_at<=now`).
- **Outputs**: `(drew, evaluated, finished)` counters.
- **Side effects**: **backpressure** — skip a room while any of its `draws` has
  `processed_at IS NULL`. Pick the next number in 1..90 not yet in `draws`,
  ordered by `digest(encode(room_seed,'hex')||':'||n,'sha256')` ascending, first
  wins. `INSERT draws` (fires `trg_after_draw_enqueue` → `draw_jobs`). Advance
  `next_draw_at = now() + draw_interval_sec` (meta, default 3, min 1). When all 90
  drawn → `rooms.status='finished'`.
- **Engine**: `domain/room/index.ts` → `manageRoomLiveActions()`; number choice in
  `core/rng.ts` → `pickNextNumber(seed, alreadyDrawn)`.

### A3. `game_core.fn_generate_room_seed()` — **KEEP** (mirrored)
- **Purpose**: 32 secure random bytes + sha256 hex hash for provably-fair rooms.
- **Outputs**: `(seed bytea, seed_hash char(64))`.
- **Engine mirror**: `core/rng.ts` → `seedHash(seed)` (`sha256Hex`). Seed
  generation stays at room creation in DB; the engine only consumes/verifies it.

### A4. `game_core.rpc_apply_marks_for_draw(p_room_id, p_draw_number)` — **MOVE**
- **Purpose**: insert `marks` for tickets whose card contains the drawn number,
  then evaluate.
- **Side effects**: `INSERT marks(ticket_id, value)` (idempotent via NOT EXISTS),
  then `PERFORM fn_evaluate_room_after_draw`.
- **Engine**: `domain/draw/evaluateDraw.ts` → `applyMarksAndEvaluate()`
  (marks upsert with `onConflict: ticket_id,value`).

### A5. `public.fn_evaluate_room_after_draw(p_room_id, p_draw_number)` — **MOVE**
- **Purpose**: derive line/full winners for a draw and trigger settlement.
- **Inputs**: room id, draw number.
- **Side effects**:
  - LINE = any fully-marked row; FULL = all cells marked.
  - LINE recorded only when `first_line_draw_number IS NULL OR = p_draw_number`
    (first-line gating); sets `rooms.first_line_draw_number` on first line.
  - Skips tickets already having a result of that win_type
    (`INSERT results … ON CONFLICT DO NOTHING`).
  - If any FULL winner this draw → `rooms.status='settling'` then
    `fn_finish_room_and_settle`.
- **Engine**: rules in `core/winEvaluation.ts` → `evaluateRoomAfterDraw()`;
  orchestration + settle call in `domain/draw/evaluateDraw.ts`.

### A6. `public.fn_process_draw_jobs_batch_worker(worker_id, total_workers)` — **MOVE**
- **Purpose**: drain `draw_jobs` (sharded), apply+evaluate, stamp processed.
- **Engine**: `workers/draw-processor` + `domain/draw/processDrawBatch.ts`
  (hybrid: RPCs) and `processDrawBatchEngine.ts` (engine: TS). `rpc_pick_draw_jobs`
  is **WRAP** (atomic `FOR UPDATE SKIP LOCKED` claim stays in DB).

### A7. `public.fn_heartbeat_tick()` — **MOVE (driver)**
- **Purpose**: cron entrypoint calling `fn_manage_waiting_rooms` +
  `fn_manage_room_live_actions`.
- **Engine**: `workers/room-scheduler` is the new driver; hybrid mode calls this
  same RPC, engine mode runs the TS ports.

---

## B. Finance / ledger (KEEP in DB; math mirrored in TS)

### B1. `game_finance.fn_wallet_apply_delta(...)` — **KEEP**
- **Purpose**: the single wallet mutation primitive.
- **Inputs**: `p_user_id, p_currency, p_amount_delta, p_transaction_type,
  p_source_kind, p_source_ref, p_description, p_meta, p_allow_negative`.
- **Outputs**: `transaction_id uuid`.
- **Side effects**: lock/create wallet `FOR UPDATE`; reject zero delta; reject
  negative result unless `p_allow_negative`; `UPDATE wallets.balance`; `INSERT
  transactions` with `ABS(delta)`, `status='completed'`, balance snapshots, and
  `room_id`/`ticket_id` from meta.
- **Engine**: wrapper `finance/index.ts` → `walletApplyDelta()`. Invariants
  mirrored in `core/wallet.ts` → `applyWalletDelta()` + `extractMetaRefs()`.

### B2. `game_finance.fn_finish_room_and_settle(p_room, p_admin_user)` — **KEEP**
- **Purpose**: atomic room settlement.
- **Side effects (in order)**: guard `status='settling'` (idempotent if
  `finished`); consume `reserved/confirmed` tickets → `fn_wallet_capture_join`;
  sum `amount_to_pool` from `fn_distribute_ticket_commission` over pending
  commission rows = `total_pool`; split into line/full pools by percentages
  (room→template→0.5, clamp/reset/renormalize); roll line pool into full if no
  line winners; pay each winner `ROUND(pool/winners,2)` via `fn_wallet_apply_delta`
  (`type='win'`, `source_kind='room_settlement'`); set `results.reward_amount`,
  `paid_at`; `rooms.status='finished'`.
- **Engine**: wrapper `finance/index.ts` → `finishRoomAndSettle()`. Pool/share
  math mirrored in `core/prizeSplit.ts` → `resolveRewardPercentages()` +
  `splitPrizePool()`.

### B3. `game_finance.fn_record_ticket_commission(p_ticket)` — **KEEP**
- **Purpose**: snapshot a ticket's commission split into `commissions_log`.
- **Side effects**: rate = room→template `commission_rate` (÷100 if >1);
  `total = CEIL(price*rate)`; `agent = CEIL(total*agent_rate)`;
  `super = CEIL(total*GREATEST(super_rate-agent_rate,0))`;
  `admin = total-agent-super`; `amount_to_pool = price-total`; insert row
  `status='pending'` (`ON CONFLICT (ticket_id) DO NOTHING`).
- **Engine**: wrapper `finance/index.ts` → `recordTicketCommission()`. Math in
  `core/commission.ts` → `computeTicketCommission()`.

### B4. `game_finance.fn_distribute_ticket_commission(p_ticket, p_admin_user)` — **KEEP**
- **Purpose**: pay the snapshotted commission, return `amount_to_pool`.
- **Side effects**: lock log row; resolve admin beneficiary (arg → first
  `admin_sub_role IS NULL` admin → any admin); credit agent/super/admin via
  `fn_wallet_apply_delta` (`fee_agent`/`fee_super`/`fee_admin`); failed tier
  credits roll into admin; set `status='settled'`, `distributed_at`.
- **Engine**: wrapper `finance/index.ts` → `distributeTicketCommission()`.

---

## C. Ding

### C1. `public.fn_aggregate_ding_for_processed_draw()` (trigger) — **KEEP** (ported)
- **Fires**: `AFTER UPDATE OF processed_at ON draws` when `NULL→NOT NULL` and
  `ding_aggregated_at IS NULL`.
- **Side effects**: `ding_per_card = COALESCE(room, template, 1)`; per user count
  cards (reserved, not cancelled) containing `new.number`; `delta = cards *
  ding_per_card`; `INSERT ding_transactions`; increment `ding_balances` for newly
  inserted rows; set `draws.ding_aggregated_at`.
- **Engine**: math `core/ding.ts` → `computeDingCredits()`/`resolveDingPerCard()`;
  orchestration `domain/ding/index.ts` → `aggregateDingForDraw()` (idempotent;
  disabled by default since the trigger remains active — see architecture §6).

---

## D. Tournament

### D1. `tournament.fn_tick_due_tournaments(p_limit, p_seed, p_batch_tables)` — **MOVE (selection + decision)**
- **Purpose**: cron tick — choose due tournaments (`registration_open` whose
  `start_at` passed, or `running`), decide eligibility (≥ min players, floor 3,
  else push `start_at` +1h), then `fn_tick_tournament` each, isolating
  per-tournament errors into `tournament.tournament_tick_log`.
- **Engine**: the **selection + eligibility decision-making is now ported to TS**:
  - decision rules: `core/tournamentEligibility.ts` → `decideTournamentTick()`,
    `resolveMinPlayersToStart()` (floor 3, `meta.min_players_to_start`).
  - orchestration + per-tournament error isolation + `tournament_tick_log`:
    `domain/tournament/index.ts` → `tickDueTournamentsEngine()`.
  - data access: `repositories/tournamentRepo.ts` (due candidates, distinct
    `created` players, defer start_at, tick-log insert).
  - In `engine` mode the worker runs `tickDueTournamentsEngine`; in `hybrid` it
    runs the whole DB RPC (`tickDueTournaments`). `lock_not_available` (55P03)
    is skipped silently, matching the SQL outer loop.

### D2. `tournament.fn_tick_tournament(...)` and seating/cycle — **WRAP** (DB)
- `fn_tick_tournament` (atomic per-tournament advance with `FOR UPDATE NOWAIT`),
  `fn_manage_tournament_cycle`, `fn_assign_templates_for_round`,
  `fn_seat_table_players`, commission snapshot triggers (`trg_te_commission_snapshot`
  → `fn_commission_snapshot_entry`), payouts (`fn_commission_payout`,
  `fn_settle_commission_payouts`) remain in the DB.
- **Rationale**: the per-tournament advance owns the row lock and the atomic
  seating/cycle + money writes. The engine now decides *whether/which* tournament
  to advance (D1) but delegates the advance itself to this RPC, preserving
  atomicity and the fallback path. Commission math is mirrored in
  `core/commission.ts` → `computeTournamentCommission()` for parity/preview.

### D3. Tournament finance — **KEEP**
- `fn_tournament_wallet_hold`, `fn_tournament_wallet_capture`,
  `fn_tournament_wallet_release`, `fn_tournament_entry_upsert` stay in DB. The API
  gateway enforces auth (entry upsert should be REVOKEd from the client — see
  `migration-checklist.md`).

---

## E. Request/auth path (API)

| Client call today | Engine command | Underlying DB |
| --- | --- | --- |
| `rpc('fn_join_or_create_room', …)` | `POST /v1/rooms/join` | `fn_system_join_or_create_room(p_user_id, …)` |
| `rpc('api_get_room_state', …)` | `GET /v1/rooms/:id/state` | `api_get_room_state` |
| `rpc('rpc_get_active_rooms')` | `GET /v1/lobby` | `rpc_get_active_rooms` |

Auth: `http/auth.ts` verifies the Supabase JWT (`auth.getUser`) → user id, then
the engine calls the engine-facing RPC with `service_role`. See
`api-migration-plan.md` for the full inventory and rollout.

---

## F. Cross-reference: pure core modules

| Core module | Ports |
| --- | --- |
| `core/money.ts` | `CEIL`, `ROUND(x,2)` (half away from zero), `GREATEST(x,0)` |
| `core/rng.ts` | `fn_generate_room_seed` hash, `fn_manage_room_live_actions` ordering, card-deal ordering |
| `core/winEvaluation.ts` | `fn_evaluate_room_after_draw` line/full + first-line gating |
| `core/commission.ts` | `fn_record_ticket_commission`, `fn_commission_snapshot_entry` |
| `core/prizeSplit.ts` | `fn_finish_room_and_settle` pool split |
| `core/ding.ts` | `fn_aggregate_ding_for_processed_draw` |
| `core/wallet.ts` | `fn_wallet_apply_delta` invariants |
| `core/tournamentEligibility.ts` | `fn_tick_due_tournaments` selection + min-players decision |
