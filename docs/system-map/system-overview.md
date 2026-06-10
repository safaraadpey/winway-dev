# System Overview — System Reality Map

> STRICT EXTRACTION. This is a "system reality model": it describes only what
> currently exists in code + database (no proposals, refactors, or assumptions).
> Generated from live Supabase introspection and codebase exploration.

## What the product is (as implemented)

A real-time **Housie/90-ball Bingo** platform ("DingMoney / winway") with:
- Money play in rooms (currency `IRR`) with line/full prizes.
- A secondary **Ding** point balance credited during play.
- Multi-round **tournaments** that reuse the normal room engine.
- A multi-tier **operator hierarchy** (admin → super → agent → player) with
  commission routing.
- An admin/agent control panel with sub-roles, audit logging, and reporting.

## Components

| Component | Tech | Role |
| --- | --- | --- |
| Web app | Next.js 14 (`app/`, `components/`, `lib/`, `services/`, `src/`) | Player, agent, and admin UIs + API routes. Talks to Supabase. |
| Database | Supabase Postgres | Source of truth for ALL game/financial state. Holds business logic in PL/pgSQL across `public`, `game_core`, `game_finance`, `game_pool`, `tournament` schemas. |
| Scheduler | `pg_cron` jobs | The live engine: room ticks, draw processing, tournament ticks, janitor, pool build (see `game-engine-reality.md`). |
| Edge functions | Supabase Edge | `dev-schedule-worker` (active, 1/min); `draw-worker` (inactive). |
| Node game-engine | `game-engine/` (TypeScript) | Standalone draw-processor + worker scaffold. Currently dormant (`GAME_RUNTIME=legacy_db`); only draw-processor implemented. |
| Redis (optional) | ioredis / Upstash REST | Only used by the Node engine for a draw-processor leader lock. |

## Authority / data-flow model

- **Postgres is authoritative.** Almost all logic lives in DB functions; the Next.js
  API routes and client mostly call RPCs or read tables (subject to RLS).
- **Writes to money/game tables are service-role only** (RLS). The API server uses
  the service key for privileged routes; `SECURITY DEFINER` functions perform the
  actual mutations.
- **`pg_cron` advances time-based state** (room start, drawing numbers, draw-job
  processing, tournament rounds). The client only triggers user actions
  (join, cancel, buy tickets) and polls snapshots.

## Roles & hierarchy

- `users.role` ∈ {`admin`, `super`, `agent`, `player`}; `users.parent_id` builds the
  tree; `players` also resolved into `player_affiliation(user_id → agent_id, super_id)`.
- `admin_sub_role` ∈ {`finance`, `support`, `room`, `dev_panel`} (DB) / treated by
  the app as {`manager`(=NULL), `finance`, `support`, `room`, `dev_panel`}; NULL = full manager.
- A specific super-admin is recognized by username **`adminzero`** in several flows.

## The eight requested systems — where they live

| System | Primary DB objects | Primary code |
| --- | --- | --- |
| Game | `rooms`, `tickets`, `draws`, `marks`, `results`, `room_templates`, `card_*` ; `game_core.*` | `app/player/gameroom`, `src/screens/*RoomScreen`, `app/api/player/*`, `services/rooms.ts`, cron `fn_heartbeat_tick`/draw workers |
| Tournament | `tournaments`, `tournament_*` ; `tournament.*` | `app/admin/tournaments`, `app/player/tournaments`, cron `fn_tick_due_tournaments` |
| Financial | `wallets`, `transactions` ; `game_finance.*`, `fn_wallet_*` | `app/api/admin/wallet/*`, `useBalances`, `FinancialReportsPage` |
| Commission | `commissions_log`, `user_commissions`, `tournament_commission_*` | `fn_record/distribute_ticket_commission`, `tournament.fn_commission_*` |
| Ding | `ding_balances`, `ding_transactions`, `*.ding_per_number` | `fn_aggregate_ding_for_processed_draw`, `app/api/me/ding-balance`, `useBalances` |
| Admin | `admin_audit_log`, `admin_permissions`, `app_runtime_flags`, `entry_banners` | `app/admin/**`, `app/api/admin/**`, `lib/admin-permissions.ts`, `lib/supabaseServer.ts` |
| Agent / affiliate | `player_affiliation`, `invitation_links`, `player_signups`, `users.referral_code` | `app/agent/**`, `SignupForm`, `handle_new_user`, `signup_player_with_code` |
| Admin sub-role | `users.admin_sub_role`, `admin_permissions` | `lib/auth-helpers.ts`, `api/admin/admins/*` |
| Player behavior | `users.last_seen_at`, `heartbeat_log*`, `v_lobby_*`, presence | `fn_ping_presence`, `fn_heartbeat_*`, lobby APIs |

## Document index (this folder)

| File | Contents |
| --- | --- |
| `system-overview.md` | This file. |
| `domain-map.md` | Cross-domain relationship/ownership map. |
| `database-domains.md` | Tables/functions/triggers/RLS/enums by domain. |
| `game-engine-reality.md` | What actually runs the game (cron vs Node), RNG, pipeline. |
| `financial-system.md` | Wallet ledger, holds/capture, commission, transfers. |
| `Ding-system.md` | Ding crediting model. |
| `tournament-system.md` | Tournament lifecycle, seating, commission, payout. |
| `admin-system.md` | Admin pages/APIs/permissions/sub-roles/audit. |
| `event-flows.md` | End-to-end lifecycles (player, tournament, financial, admin, agent). |

## Notable current-state facts (recorded, not judged)
- The Node `game-engine` is dormant (`legacy_db`); `room-scheduler` and
  `tournament-orchestrator` are stubs. The DB cron is the live engine.
- `trg_rooms_after_live` and `trg_tickets_after_paid` triggers are **no-ops**.
- 16 tables have **RLS disabled** (heartbeat partitions, debug/log/runtime tables,
  `dev_room_schedules`, `app_runtime_flags`, `tournament.*` diagnostics) — see
  `database-domains.md` §5.
- DB enum `admin_sub_role` includes `dev_panel` for the isolated Dev Panel (`/dev-panel`);
  full-access admins use `admin_sub_role IS NULL` (app alias `manager`).
- `app/player/wallet` and `app/ding` are placeholder pages ("در حال توسعه").
