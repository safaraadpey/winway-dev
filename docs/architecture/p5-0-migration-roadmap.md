# P5.0 — Multi-Game Database Migration Roadmap

> READ ONLY · Planning only · **No migrations in this phase**  
> Based on [p5-0-multigame-database-audit.md](./p5-0-multigame-database-audit.md) · [p5-0-target-database-architecture.md](./p5-0-target-database-architecture.md)

---

## 0. Principles

1. **Financial safety first** — never break wallet/ledger uniqueness or settle idempotency.
2. **Compatibility windows** — prefer views/synonyms over big-bang renames.
3. **Engine code before hard DB moves** — contracts in packages; bingo engine already isolated in repo (P4.3).
4. **One Category C object at a time** — rooms ≠ tournaments ≠ settle in the same release.
5. **Rollback plan required** before each financial-touching phase.

---

## 1. Migration phases (proposed)

### Phase P5.1 — Freeze boundaries (docs + lint, no SQL move)

**Goal:** Prevent new MIXED growth.

- Document “no new bingo columns on platform tables”
- Add review checklist for migrations (game_code required for new session tables)
- Inventory all writers of `rooms` / `tickets` / settle RPCs

**Risk:** Low  
**Rollback:** N/A (docs)

---

### Phase P5.2 — Introduce Platform Core tables *alongside* (additive)

**Goal:** Create empty/parallel conceptual tables (or documented stubs) without cutting over.

Examples (when approved later):

- `platform.games` / `engine_registry`
- Optional `game_code` column on new objects only

**Do not yet:** move wallets or drop bingo columns.

**Risk:** Low–Medium (search_path / grants)  
**Rollback:** Drop additive objects

---

### Phase P5.3 — Split read models (views)

**Goal:** Present `game_sessions` / `bingo.room_state` as **views** over current `rooms` for new code paths.

- Old engines keep writing `public.rooms`
- New APIs read through views

**Risk:** Medium (column mapping bugs)  
**Rollback:** Revert views; keep writers on `rooms`

---

### Phase P5.4 — Split join path (high care)

**Goal:** Separate wallet hold (platform) from card reservation (bingo).

- Extract seat/card steps from `fn_join_or_create_room*`
- Keep single transactional wrapper initially

**Risk:** **High** — money + seat race conditions  
**Rollback:** Feature flag back to monolithic join RPC  
**Idempotency:** preserve hold keys / ticket uniqueness

---

### Phase P5.5 — Split settle path (highest financial risk)

**Goal:** Bingo computes prize lines → Platform applies ledger.

- `fn_finish_room_and_settle` becomes orchestrator + engine prize function
- Settlement idempotency keys mandatory

**Risk:** **Critical** — double pay / missed pay  
**Rollback:** Monolithic settle behind flag; reconcile ledger diffs  
**Never:** settle from realtime alone

---

### Phase P5.6 — Physical schema move (bingo objects)

**Goal:** `ALTER … SET SCHEMA bingo` (or copy+swap) for pure Category B tables.

Order suggestion:

1. Card pools / masks (low runtime coupling if pool gen isolated)
2. Marks / draws / draw_jobs
3. Tickets / results / room_winners
4. Update RPC search_path / grants
5. Cron retarget

**Risk:** High (PostgREST, RLS, FKs from `rooms`)  
**Rollback:** Reverse schema move + grant restore  
**Compatibility:** keep `public` views with old names during soak

---

### Phase P5.7 — Split `rooms` / `room_templates` storage

**Goal:** Persist shell in platform tables; bingo state in bingo tables; dual-write then cutover.

**Risk:** **Critical** — every engine loop, snapshot API, tournament seating  
**Rollback:** Dual-read preference to old `rooms`  
**Prerequisite:** P5.4–P5.5 stable in production

---

### Phase P5.8 — Tournament framework generalization

**Goal:** Platform tournaments schedule `game_sessions` by `game_code`; bingo adapter seats tickets.

**Risk:** High for live tournaments  
**Rollback:** Bingo-only tournament path flag

---

### Phase P5.9 — Backgammon greenfield schema

**Goal:** Create `backgammon.*` without touching bingo tables.

- Reuse platform users/wallets/sessions/settlements
- No reuse of draws/tickets/cards

**Risk:** Medium (new engine bugs); **Low** to bingo if isolated  
**Rollback:** Disable backgammon game_code

---

### Phase P5.10 — Retire MIXED leftovers

**Goal:** Drop bingo columns from platform shell; remove dual-write; archive legacy enums.

**Risk:** Medium  
**Rollback:** Restore columns from backup window only if within retention

---

## 2. Highest-risk migrations

| Rank | Change | Why |
|------|--------|-----|
| 1 | Settle RPC split | Money correctness |
| 2 | `rooms` physical split | Hot path + FKs + engine lease |
| 3 | Join RPC split | Holds + card races |
| 4 | Tickets schema move | Commission + GMV + UI snapshots |
| 5 | Tournament seating generalization | Live brackets |

---

## 3. Financial risks

| Risk | Mitigation |
|------|------------|
| Double settlement | Idempotency keys + status guards (existing standard) |
| Orphan holds after join split | Compensating release job; ledger audit |
| Commission on renamed ticket refs | Adapter layer; keep stable `source_ref` |
| Ding credit tied to draws | Keep bingo trigger; ding ledger stays platform |
| Partial migrate mid-room | Ban cutover while rooms in `live`/`settling` |

---

## 4. Compatibility risks

| Consumer | Risk |
|----------|------|
| Next.js admin/player APIs | Assume `public.rooms` / tickets shape |
| `apps/engines/bingo` | Direct SQL / RPC names |
| PostgREST / Supabase clients | Schema exposure |
| Snapshot APIs | Must remain complete (api-contracts rule) |
| Realtime channels | Often keyed by `room_id` |

Prefer **compatibility views** for ≥1 release after each cutover.

---

## 5. Rollback complexity

| Phase | Rollback difficulty |
|-------|---------------------|
| P5.1–P5.2 | Easy |
| P5.3 views | Easy |
| P5.4 join split | Hard (in-flight holds) |
| P5.5 settle split | **Very hard** (ledger irreversible without compensating txns) |
| P5.6 schema move | Hard (grants + client cache) |
| P5.7 rooms split | **Very hard** |
| P5.8 tournaments | Hard |
| P5.9 backgammon add | Easy (isolate) |
| P5.10 drop columns | Hard after soak |

**Rule:** No irreversible DROP of bingo columns until Backgammon (or second engine) has shipped on the new session model.

---

## 6. What not to do early

- Big-bang rename `rooms` → `game_sessions` without views
- Move `wallets` into an engine schema
- Share `tickets` / `draws` with Backgammon
- Put line/full columns on platform session tables “temporarily”
- Migrate settle and rooms in the same release

---

## 7. Suggested readiness gates

Before P5.5 (settle split):

- [ ] Ledger reconciliation queries documented
- [ ] Idempotency keys proven under retry load test
- [ ] Feature flag to monolithic settle

Before P5.7 (rooms split):

- [ ] Join/settle already split or wrapped
- [ ] Snapshot API contract tests
- [ ] Zero dual-write drift for N days

Before P5.9 (Backgammon):

- [ ] `platform.games` + session shell used by Bingo in prod
- [ ] Settlement request contract in `packages/game-contracts`

---

## 8. Relation to code roadmap (P4)

| Code (done / planned) | DB phase |
|-----------------------|----------|
| P4.3 engines folders | Enables P5.9 isolation |
| P4.4 shared packages | Hosts session/settlement DTOs before P5.4 |
| Web still root | Unrelated to DB schema move |
| Constitution / Engine guide | Normative for all P5.x |

---

## 9. Deliverable status

| Doc | Purpose |
|-----|---------|
| [p5-0-multigame-database-audit.md](./p5-0-multigame-database-audit.md) | Verdict + inventory + hidden assumptions |
| [p5-0-platform-vs-domain-map.md](./p5-0-platform-vs-domain-map.md) | A/B/C/D classification grid |
| [p5-0-target-database-architecture.md](./p5-0-target-database-architecture.md) | Target schemas + Platform Core |
| This file | Phased migration + risks |

**This phase implements none of P5.1+.**
