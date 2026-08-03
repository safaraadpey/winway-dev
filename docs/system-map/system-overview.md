# System Overview — System Reality Map

> Updated 2026-07-31 (docs drift cleanup). Describes current architecture with
> emphasis on **DEV** authority after Railway cutover + cron mutex.
> Historical snapshots may differ on Production until a separate prod mutex.

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
| Web app | Next.js 14 (`app/`, `components/`, `lib/`, `services/`, `src/`) | Player, agent, and admin UIs + API routes. Talks to Supabase and optionally Railway Game Engine (`NEXT_PUBLIC_USE_GAME_ENGINE`). |
| Database | Supabase Postgres | **System of record** for ALL game/financial state. Holds business logic in PL/pgSQL across `public`, `game_core`, `game_finance`, `game_pool`, `tournament` schemas. |
| Railway Game Engine | `apps/engines/bingo/` (TypeScript) on Railway | **Canonical runtime authority in DEV** (`GAME_RUNTIME=engine`): waiting-room promote, live draw loop (`room-loop`), draw-job drain, tournament tick, dev-player workers. |
| Scheduler (maintenance) | `pg_cron` jobs | **Maintenance authority** on DEV: janitor sweep, card-pool step, partitions, retention. Game-clock crons (`bingo_heartbeat`, `bingo_draw_worker_*`) are **mutex-disabled on DEV**. |
| Edge functions | Supabase Edge | Deployed stubs exist historically; **not** the live game runtime. Dev-player work runs on the engine when roles are enabled. |
| Redis (optional) | ioredis / Upstash REST | Used by the **Game Engine** for leader locks / multi-replica coordination — not by Next.js lobby cache. |

## Authority / data-flow model

- **Postgres is the system of record.** Money, rooms, draws, wallets, and settlement
  truth live in the database (RPC / direct SQL from trusted servers).
- **Railway Game Engine is the canonical runtime authority in DEV.** It drives
  waiting→playing, live draws, draw-job processing, and tournament ticks when
  `SCHEDULER_ENABLED=true` and the matching `GAME_ENGINE_ROLES` are set.
- **Supabase remains the system of record and maintenance authority** (schema,
  RLS, settlement RPCs, janitor/pool/retention crons).
- **Writes to money/game tables are service-role only** (RLS). The API server and
  engine use the service key for privileged work; `SECURITY DEFINER` functions
  perform many mutations.
- The Next.js client triggers user actions (join, cancel, buy tickets) and reads
  snapshots (Vercel and/or Railway `/v1/*` behind feature flags).

## Roles & hierarchy

- `users.role` ∈ {`admin`, `super`, `agent`, `player`}; `users.parent_id` builds the
  tree; `players` also resolved into `player_affiliation(user_id → agent_id, super_id)`.
- `admin_sub_role` ∈ {`finance`, `support`, `room`, `dev_panel`} (DB) / treated by
  the app as {`manager`(=NULL), `finance`, `support`, `room`, `dev_panel`}; NULL = full manager.
- A specific super-admin is recognized by username **`adminzero`** in several flows.

## The eight requested systems — where they live

| System | Primary DB objects | Primary code |
| --- | --- | --- |
| Game | `rooms`, `tickets`, `draws`, `marks`, `results`, `room_templates`, `card_*` ; `game_core.*` | `app/player/gameroom`, `src/screens/*RoomScreen`, `app/api/player/*`, `services/rooms.ts`, Railway `scheduler` / `room-loop` / `draw-processor` |
| Tournament | `tournaments`, `tournament_*` ; `tournament.*` | `app/admin/tournaments`, `app/player/tournaments`, Railway `tournament-orchestrator` (DEV; tournament cron absent on DEV) |
| Financial | `wallets`, `transactions` ; `game_finance.*`, `fn_wallet_*` | `app/api/admin/wallet/*`, `useBalances`, `FinancialReportsPage` |
| Commission | `commissions_log`, `user_commissions`, `tournament_commission_*` | `fn_record/distribute_ticket_commission`, `tournament.fn_commission_*` |
| Ding | `ding_balances`, `ding_transactions`, `*.ding_per_number` | `fn_aggregate_ding_for_processed_draw`, `app/api/me/ding-balance`, `useBalances` |
| Admin | `admin_audit_log`, `admin_permissions`, `app_runtime_flags`, `entry_banners` | `app/admin/**`, `app/api/admin/**`, `lib/admin-permissions.ts`, `lib/supabaseServer.ts` |
| Agent / affiliate | `player_affiliation`, `invitation_links`, `player_signups`, `users.referral_code` | `app/agent/**`, `SignupForm`, `handle_new_user`, `signup_player_with_code` |
| Admin sub-role | `users.admin_sub_role`, `admin_permissions` | `lib/auth-helpers.ts`, `api/admin/admins/*` |
| Player behavior | `users.last_seen_at`, `heartbeat_log*`, `v_lobby_*`, presence | `fn_ping_presence`, lobby APIs / ActiveGames |

## Document index (this folder)

| File | Contents |
| --- | --- |
| `system-overview.md` | This file. |
| `domain-map.md` | Cross-domain relationship/ownership map. |
| `database-domains.md` | Tables/functions/triggers/RLS/enums by domain. |
| `game-engine-reality.md` | What actually runs the game (Railway vs cron), RNG, pipeline. |
| `financial-system.md` | Wallet ledger, holds/capture, commission, transfers. |
| `Ding-system.md` | Ding crediting model. |
| `tournament-system.md` | Tournament lifecycle, seating, commission, payout. |
| `admin-system.md` | Admin pages/APIs/permissions/sub-roles/audit. |
| `event-flows.md` | End-to-end lifecycles (player, tournament, financial, admin, agent). |

## Notable current-state facts (recorded, not judged)

- **DEV:** Railway Game Engine (`GAME_RUNTIME=engine`) is the live game runtime;
  `bingo_heartbeat` and `bingo_draw_worker_1..3` were removed by the DEV cron mutex
  (`docs/runbooks/dev-game-cron-mutex-apply.md`). Maintenance crons remain.
- **Production:** cron ↔ engine ownership must be verified separately before assuming
  the same mutex (see `docs/audits/deployment-runtime-state-audit.md`).
- `ROOM_LOOP_MODE` / `loopMode.ts` are **removed**; live draws in engine mode are
  actor-only (`docs/adr/0001-actor-only-live-draw-loop.md`).
- `trg_rooms_after_live` and `trg_tickets_after_paid` triggers are **no-ops**.
- 16 tables have **RLS disabled** (heartbeat partitions, debug/log/runtime tables,
  `dev_room_schedules`, `app_runtime_flags`, `tournament.*` diagnostics) — see
  `database-domains.md` §5.
- DB enum `admin_sub_role` includes `dev_panel` for the isolated Dev Panel (`/dev-panel`);
  full-access admins use `admin_sub_role IS NULL` (app alias `manager`).
- `app/player/wallet` and `app/ding` are placeholder pages ("در حال توسعه").
