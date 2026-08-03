# P5.0 — Multi-Game Database Architecture Audit

> **Phase:** P5.0 — READ ONLY  
> **Date:** 2026-08-03  
> **Sources:** Live Supabase develop catalog · `docs/system-map/database-domains.md` · P1.8 function inventory · `sql/migrations/` · `docs/ENGINE_DEVELOPMENT_GUIDE.md` · `docs/CONSTITUTION.md`  
> **No SQL changes. No migrations. No code changes.**

Companions:

- [p5-0-platform-vs-domain-map.md](./p5-0-platform-vs-domain-map.md)
- [p5-0-target-database-architecture.md](./p5-0-target-database-architecture.md)
- [p5-0-migration-roadmap.md](./p5-0-migration-roadmap.md)

---

## Executive verdict

**The current database is not multi-game capable.**

It is a **Bingo-domain schema** with **strong Platform finance/identity primitives** sharing the same `public` namespace and often the same tables (`rooms`, `room_templates`, `tickets`).

| Question | Answer |
|----------|--------|
| Can Backgammon use the DB unchanged? | **No** |
| Is Platform Core separable today? | **Partially** (wallet/ledger/users yes; rooms/templates no) |
| Highest blocker | `rooms` / `room_templates` / `tickets` encode Housie (cards, draws, line/full, ding_per_number) |
| Safe next step | Architecture + phased isolation — **not** a big-bang rename |

---

## 1. Current database map (live)

### Schemas

| Schema | Role today |
|--------|------------|
| `public` | Almost all application tables + PostgREST surface |
| `game_core` | Join / waiting / live / evaluate / janitor / card-pool step |
| `game_finance` | Wallet delta, settle, ticket commission |
| `game_pool` | Housie card pool generation |
| `tournament` | Tournament tick / seating / commission helpers + local tables |
| `monitor` | Ops views |
| `load_test` | Load-test helpers |
| `auth` / `storage` / `cron` / `realtime` | Supabase platform (out of app scope) |

### Tables (application) — classification summary

#### Category A — PLATFORM CORE

| Object | Backgammon unchanged? | → Platform? | → bingo schema? | Stay shared? | Target schema |
|--------|----------------------|-------------|-----------------|--------------|---------------|
| `users` | YES | Yes | No | Yes (platform) | `platform` |
| `user_profiles` | YES | Yes | No | Yes | `platform` |
| `user_notes` | YES | Yes | No | Yes | `platform` |
| `player_affiliation` | YES | Yes | No | Yes | `platform` |
| `user_commissions` | YES | Yes | No | Yes | `platform` |
| `invitation_links` / `player_signups` | YES | Yes | No | Yes | `platform` |
| `referral_code_history` | YES | Yes | No | Yes | `platform` |
| `wallets` | YES | Yes | No | Yes | `platform` |
| `transactions` | YES | Yes | No | Yes | `platform` |
| `commissions_log` | PARTIAL* | Yes (with generic session refs) | No | Yes | `platform` |
| `admin_audit_log` / `admin_permissions` | YES | Yes | No | Yes | `platform` |
| `app_runtime_flags` | YES | Yes | No | Yes | `platform` |
| `entry_banners` | YES | Yes | No | Yes | `platform` |
| `heartbeat_log*` | YES | Yes | No | Yes | `platform` |
| `ding_balances` / `ding_transactions` | PARTIAL** | Yes (as secondary ledger) | No | Yes | `platform` |

\* `commissions_log` keyed by `ticket_id` / `room_id` — ticket is Bingo-shaped.  
\*\* Ding credit path is draw/number-centric today.

#### Category B — BINGO DOMAIN

| Object | Backgammon unchanged? | → Platform? | → bingo schema? | Stay shared? | Target |
|--------|----------------------|-------------|-----------------|--------------|--------|
| `card_pools` / `card_pool_cards` / `card_numbers` | NO | No | Yes | No | `bingo` |
| `card_definition_masks` / `card_number_index` | NO | No | Yes | No | `bingo` |
| `draws` / `draw_jobs` | NO | No | Yes | No | `bingo` |
| `marks` | NO | No | Yes | No | `bingo` |
| `results` (`win_type` line/full) | NO | No | Yes | No | `bingo` |
| `room_winners` | NO | No | Yes | No | `bingo` |
| `tickets` (pool_card_id, card_no, claimed_bingo_at) | NO | No | Yes | No | `bingo` |
| `v_active_pool` / `v_card_hits` / `v_row_hits` | NO | No | Yes | No | `bingo` |
| `v_draw_latency_*` / `v_engine_loop_health` | NO | No | Yes (or `monitor`) | No | `bingo`/`monitor` |
| Dev player join tables tied to templates/cards | NO | No | Yes (ops) | No | `bingo` / `tools` |

#### Category C — MIXED (highest future refactor cost)

| Object | Why mixed | Backgammon unchanged? | Should become Platform? | Move to bingo? | Stay shared? | Target |
|--------|-----------|----------------------|-------------------------|----------------|--------------|--------|
| `room_templates` | Session catalog **+** `draw_interval_sec`, `line_*`, `full_*`, `ding_per_number`, `max_cards_per_player` | NO | Session shell **yes**; bingo columns **no** | Bingo columns yes | Shell yes | `platform.game_templates` + `bingo.template_rules` |
| `rooms` | Generic lifecycle **+** `pool_id`, `next_draw_at`, `line/full_prize_pool`, seeds, lease | PARTIAL | Session shell **yes** | Bingo columns / draw clock yes | Shell yes | `platform.game_sessions` + `bingo.room_state` |
| `tournaments` (+ entries/rounds) | Platform tournament **but** seats into bingo rooms/tickets/cards | PARTIAL | Tournament framework **yes** | Bingo seating adapters yes | Framework yes | `platform.tournaments*` + engine adapters |
| `fn_join_or_create_room*` | Hold wallet (platform) + reserve cards (bingo) | NO | Split: finance hold platform; seat bingo | Bingo seating yes | No as one blob | split |
| `fn_finish_room_and_settle` | Ledger (platform) + line/full split (bingo) | NO | Settlement orchestration platform; prize rules bingo | Prize rules yes | No as one blob | split |
| `fn_record/distribute_ticket_commission` | Platform commission **keyed by ticket** | PARTIAL | Yes, generalized to `source_item` | Ticket binding bingo | Concept shared | platform + adapter |
| Ding aggregate on draws | Platform ding ledger **driven by bingo draws** | NO | Ding ledger yes; trigger path bingo | Trigger/credit rules yes | Ledger shared | split |

#### Category D — UNKNOWN / low priority

| Object | Why uncertain |
|--------|----------------|
| `user_profiles_old_backup` | Legacy; likely delete/archive |
| `debug_room_status_log` | Ops debug; not product SoT |
| `tournament_commission_log` (empty) | Legacy alternate; confirm before move |
| `load_test.*` | Non-prod |
| Some finance views | Platform reporting but assume room/ticket GMV |

---

## 2. Functions / triggers / enums / cron (summary)

### Function schemas (≈205 app functions — P1.8)

| Family | Category bias |
|--------|----------------|
| `game_finance.fn_wallet_*` | **A** Platform |
| `game_finance.fn_finish_room_and_settle` / commission | **C** Mixed |
| `game_core.fn_join*` / `fn_manage_*` / `fn_evaluate_*` | **C** or **B** |
| `game_pool.*` / bitmask / card pool | **B** Bingo |
| `tournament.fn_*` | **C** Mixed (framework + bingo seating) |
| `rpc_pick_draw_jobs` / marks / claim lease | **B** (+ lease pattern reusable → future platform) |
| Reporting `fn_admin_*` / `fn_player_*` | **C** (reports embed bingo metrics) |

### Triggers (selected)

| Trigger | Category |
|---------|----------|
| `trg_after_draw_enqueue` | B |
| `trg_aggregate_ding_on_processed_at` (disabled in engine mode) | C |
| `trg_sync_card_numbers` | B |
| `trg_sync_room_winners_from_results` | B |
| `trg_lock_commission_snapshot` | A/C |
| Tournament entry commission snapshot | C |
| `handle_new_user` (auth) | A |

### Enums with Bingo gravity

| Enum | Category | Note |
|------|----------|------|
| `room_status` | C | Useful for sessions; values include bingo-era aliases (`live`/`idle`) |
| `reservation_status` | C | Ticket-shaped; may generalize to holds |
| `results.win_type` text `line`/`full` | B | Not reusable for Backgammon |

### Live cron (`cron.job`)

| Job | Active | Category |
|-----|--------|----------|
| `fn_generate_card_pool_step` | true | **B** |
| `fn_janitor_sweep` | true | **C** (bingo room janitor today) |
| `heartbeat_log_partitions` | true | **A** |
| `cleanup_retention` | true | **A** |

Disabled historically: `bingo_heartbeat`, `bingo_draw_worker_*`, tournament tick (engine-owned).

---

## 3. Hidden Bingo assumptions (detection)

Found across SQL names, columns, functions, enums:

| Assumption | Where |
|------------|--------|
| **Card / pool / Housie 1–90 / 15 cells** | `card_*`, `pool_id`, bitmask tables, `game_pool` |
| **Draw / draw_jobs / next_draw_at** | `draws`, `draw_jobs`, `rooms.next_draw_at`, rpc_pick_* |
| **Line / full house** | `line_reward_%`, `full_reward_%`, `results.win_type`, evaluate RPCs |
| **Ticket = bingo card purchase** | `tickets`, commission keyed by ticket, join holds per ticket |
| **Mark number on card** | `marks`, `rpc_apply_marks_for_draw` |
| **Ding per drawn number** | `ding_per_number`, ding aggregate on draw |
| **Room ≈ bingo table** | Entire `rooms` model used by tournament seating |
| **Winner = line/full on ticket** | `results`, `room_winners`, settle splits |

**Conclusion:** “Room” in this codebase is **not** a neutral game session. It is a **Bingo room**.

---

## 4. Answers for future engines (compressed)

| Can Backgammon use unchanged? | Dominant answer: **NO** for game tables; **YES** for users/wallets/ledger primitives |
| Should become Platform? | Identity, wallet, ledger, audit, presence, tournament **framework**, generic session shell |
| Move into `bingo` schema? | Cards, draws, marks, tickets, pools, evaluate, bingo cron step |
| Stay shared? | Only true Platform Core + future `platform.game_sessions` abstractions |

---

## 5. Risk analysis (audit level)

| Risk | Severity | Notes |
|------|----------|-------|
| Splitting `rooms` / settle while live | **Critical** | Financial + gameplay coupling |
| Renaming `tickets` while commissions reference them | **High** | Ledger `source_ref` / commission FKs |
| Tournament seating still assumes bingo join | **High** | Cannot add Backgammon tournaments until adapter exists |
| Dual-write during migration | **High** | Rollback complexity |
| Moving schemas under PostgREST | **Medium** | API grants / search_path |
| Cron card-pool during move | **Medium** | Must stay on bingo schema |

Full roadmap risks: [p5-0-migration-roadmap.md](./p5-0-migration-roadmap.md).

---

## 6. Constraints confirmation

This phase did **not**:

- change SQL / RLS / policies  
- create migrations  
- rename schemas  
- edit application code  
- commit or push  

---

## Related

- Constitution Ch. 2, 4–7 — multi-engine + DB truth + derived data  
- `docs/ENGINE_DEVELOPMENT_GUIDE.md` — ownership boundaries  
- P4.3/P4.4 engine package layout — code side already multi-engine; **DB is not**
