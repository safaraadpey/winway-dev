# P5.0 — Platform vs Domain Map

> READ ONLY · Companion to [p5-0-multigame-database-audit.md](./p5-0-multigame-database-audit.md)

Classification key:

| Cat | Meaning |
|-----|---------|
| **A** | PLATFORM CORE |
| **B** | BINGO DOMAIN |
| **C** | MIXED (platform + bingo) |
| **D** | UNKNOWN |

Per-object columns:

1. Backgammon unchanged? (`YES` / `NO` / `PARTIAL`)
2. Become Platform?
3. Move to bingo schema?
4. Stay shared?
5. Future target schema

---

## 1. Tables — `public`

| Object | Cat | BG unchanged? | → Platform? | → bingo? | Shared? | Target |
|--------|-----|---------------|-------------|----------|---------|--------|
| `users` | A | YES | Yes | No | Yes | `platform` |
| `user_profiles` | A | YES | Yes | No | Yes | `platform` |
| `user_notes` | A | YES | Yes | No | Yes | `platform` |
| `user_profiles_old_backup` | D | — | Archive/drop | No | No | retire |
| `player_affiliation` | A | YES | Yes | No | Yes | `platform` |
| `user_commissions` | A | YES | Yes | No | Yes | `platform` |
| `invitation_links` | A | YES | Yes | No | Yes | `platform` |
| `player_signups` | A | YES | Yes | No | Yes | `platform` |
| `referral_code_history` | A | YES | Yes | No | Yes | `platform` |
| `wallets` | A | YES | Yes | No | Yes | `platform` |
| `transactions` | A | YES | Yes | No | Yes | `platform` |
| `commissions_log` | C | PARTIAL | Yes (generalize refs) | Ticket FK later | Concept yes | `platform` |
| `ding_balances` | A | PARTIAL | Yes (secondary currency) | Credit rules no | Ledger yes | `platform` |
| `ding_transactions` | A | PARTIAL | Yes | Credit rules no | Ledger yes | `platform` |
| `admin_audit_log` | A | YES | Yes | No | Yes | `platform` |
| `admin_permissions` | A | YES | Yes | No | Yes | `platform` |
| `app_runtime_flags` | A | YES | Yes | No | Yes | `platform` |
| `entry_banners` | A | YES | Yes | No | Yes | `platform` |
| `heartbeat_log` (+ partitions) | A | YES | Yes | No | Yes | `platform` |
| `room_templates` | C | NO | Shell yes | Rules yes | Shell only | split |
| `rooms` | C | PARTIAL | Shell yes | State yes | Shell only | split |
| `tickets` | B | NO | No | Yes | No | `bingo` |
| `draws` | B | NO | No | Yes | No | `bingo` |
| `draw_jobs` | B | NO | No | Yes | No | `bingo` |
| `marks` | B | NO | No | Yes | No | `bingo` |
| `results` | B | NO | No | Yes | No | `bingo` |
| `room_winners` | B | NO | No | Yes | No | `bingo` |
| `card_pools` | B | NO | No | Yes | No | `bingo` |
| `card_pool_cards` | B | NO | No | Yes | No | `bingo` |
| `card_numbers` | B | NO | No | Yes | No | `bingo` |
| `card_definition_masks` | B | NO | No | Yes | No | `bingo` |
| `card_number_index` | B | NO | No | Yes | No | `bingo` |
| `tournaments` | C | PARTIAL | Framework yes | Seating adapter | Framework | split |
| `tournament_entries` | C | PARTIAL | Yes | Bingo seat fields | Framework | split |
| `tournament_rounds` | C | PARTIAL | Yes | Room linkage | Framework | split |
| `tournament_round_rooms` | C | NO | Session link yes | Bingo room id | Link | split |
| `tournament_seats` / seating tables | C | NO | Seating model yes | Bingo card/ticket | Concept | split |
| `tournament_commission_log` | D | — | Confirm | Possibly retire | — | TBD |
| `debug_room_status_log` | D | — | Ops only | No | No | `monitor`/drop |
| Dev join helper tables | B/D | NO | No | Yes (ops) | No | tools |

---

## 2. Tables — other schemas

| Object | Cat | BG unchanged? | Notes | Target |
|--------|-----|---------------|-------|--------|
| `tournament.*` local tables | C | PARTIAL | Tick/seating helpers | `platform` + adapters |
| `game_pool.*` tables | B | NO | Housie generation | `bingo` |
| `monitor.*` views/tables | A/B | PARTIAL | Ops; many bingo metrics | `monitor` |
| `load_test.*` | D | — | Non-prod | stay / drop |

---

## 3. Views (selected)

| View | Cat | BG unchanged? | Target |
|------|-----|---------------|--------|
| `v_active_pool` | B | NO | `bingo` |
| `v_card_hits` / `v_row_hits` | B | NO | `bingo` |
| `v_draw_latency_*` | B | NO | `bingo`/`monitor` |
| `v_engine_loop_health` | B | NO | `bingo`/`monitor` |
| Finance / GMV admin views | C | PARTIAL | `platform` reporting + game filter |
| Tournament leaderboard views | C | PARTIAL | platform + engine score adapters |

---

## 4. Function families

| Family | Cat | BG unchanged? | → Platform? | → bingo? | Target |
|--------|-----|---------------|-------------|----------|--------|
| `game_finance.fn_wallet_*` | A | YES | Yes | No | `platform` |
| `game_finance.fn_finish_room_and_settle` | C | NO | Orchestration | Prize rules | split |
| `game_finance.fn_*ticket_commission*` | C | PARTIAL | Yes (generic source) | Ticket adapter | split |
| `game_core.fn_join_or_create_room*` | C | NO | Hold/wallet | Seat/card | split |
| `game_core.fn_manage_*` / waiting | C | PARTIAL | Session lifecycle | Bingo waiting rules | split |
| `game_core.fn_evaluate_*` | B | NO | No | Yes | `bingo` |
| `game_core.fn_janitor_sweep` | C | PARTIAL | Generic janitor | Bingo timeouts | split |
| `game_core.fn_generate_card_pool_step` | B | NO | No | Yes | `bingo` |
| `game_pool.*` | B | NO | No | Yes | `bingo` |
| `rpc_pick_draw_jobs` / apply marks | B | NO | Lease pattern reusable | Yes | `bingo` (+ platform lease kit later) |
| `tournament.fn_*` | C | PARTIAL | Tick/bracket | Seating into bingo rooms | split |
| Auth `handle_new_user` | A | YES | Yes | No | `platform` |
| Admin report RPCs | C | PARTIAL | Yes | Metrics bingo-shaped | platform + filters |

---

## 5. Triggers

| Trigger / family | Cat | BG unchanged? | Target |
|------------------|-----|---------------|--------|
| After draw enqueue | B | NO | `bingo` |
| Aggregate ding on draw processed | C | NO | platform ding ledger + bingo trigger |
| Sync card numbers / masks | B | NO | `bingo` |
| Sync room_winners from results | B | NO | `bingo` |
| Commission snapshot lock | A/C | PARTIAL | `platform` |
| Tournament entry commission | C | PARTIAL | `platform` + tournament |
| New user profile | A | YES | `platform` |

---

## 6. Enums / domains

| Object | Cat | BG unchanged? | Notes | Target |
|--------|-----|---------------|-------|--------|
| `room_status` | C | PARTIAL | Reusable lifecycle; bingo aliases | `platform` session_status |
| `reservation_status` | C | PARTIAL | Hold lifecycle | `platform` |
| `win_type` (`line`/`full`) | B | NO | Bingo-only | `bingo` |
| Other room/ticket status texts | C | PARTIAL | Audit case-by-case | mostly `platform` |

---

## 7. Indexes (policy)

Indexes follow their parent table’s category. Bingo-hot indexes (`draws(room_id, draw_number)`, marks, pool cards) → **B**. Wallet/ledger uniqueness → **A**. Mixed tables (`rooms`) carry both — **C** until split.

---

## 8. Policies / RLS

| Surface | Cat | Notes |
|---------|-----|-------|
| `users` / profiles / wallets RLS | A | Stay platform |
| `rooms` / `tickets` / `draws` RLS | B/C | Today assume bingo player seat |
| Admin bypass patterns | A | Stay platform |
| Tournament RLS | C | Framework + bingo entry |

---

## 9. Cron jobs (live)

| Job | Cat | BG unchanged? | Target |
|-----|-----|---------------|--------|
| `fn_generate_card_pool_step` | B | NO | `bingo` |
| `fn_janitor_sweep` | C | PARTIAL | platform janitor + bingo rules |
| `heartbeat_log_partitions` | A | YES | `platform` |
| `cleanup_retention` | A | YES | `platform` |

Historical / disabled: `bingo_heartbeat`, `bingo_draw_worker_*` → **B** (engine-owned; do not revive as platform).

---

## 10. Boundary diagram (current)

```text
┌─────────────────────────────────────────────────────────────┐
│ public (flat)                                               │
│  ┌──────────────┐  ┌────────────────────┐  ┌─────────────┐ │
│  │ A Platform   │  │ C MIXED            │  │ B Bingo     │ │
│  │ users        │  │ rooms              │  │ cards/pools │ │
│  │ wallets      │  │ room_templates     │  │ draws/marks │ │
│  │ transactions │  │ tournaments*       │  │ tickets     │ │
│  │ ding_*       │  │ join/settle RPCs   │  │ results     │ │
│  └──────────────┘  └────────────────────┘  └─────────────┘ │
│         ▲                    │                    │         │
│         └──────── game_finance / game_core ───────┘         │
└─────────────────────────────────────────────────────────────┘
```

**Problem:** Category **C** is the load-bearing middle. New engines cannot plug in until **C** is split.

---

## 11. Boundary diagram (target — conceptual)

```text
platform.*          bingo.*              backgammon.* (future)
──────────          ───────              ────────────────────
users               cards/pools          matches/boards
wallets             draws/marks          moves/clocks
transactions        tickets              (engine tables)
game_sessions       room_state           
game_templates      template_rules       
tournaments*        seating adapters     
settlements*        prize_rules          
engine_registry     
engine_events       
```

Details: [p5-0-target-database-architecture.md](./p5-0-target-database-architecture.md).
