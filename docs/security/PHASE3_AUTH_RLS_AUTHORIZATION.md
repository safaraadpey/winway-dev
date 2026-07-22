# Phase 3 — Authentication, Authorization & Supabase RLS (Read-Only)

**Platform:** Ding Money (winway)  
**Phase:** 3 — AuthN/AuthZ and database RLS deep audit  
**Date:** 2026-07-21  
**Status:** Read-only; no changes applied.

**Sources:** Application code (`winway/`), database catalog (`supabase/schema.sql`), SQL migrations (`winway/sql/migrations/`).  
**Related:** [Phase 1](./PHASE1_ARCHITECTURE_ATTACK_SURFACE_AUDIT.md) · [Phase 2](./PHASE2_SECRETS_INFRA_DEPLOYMENT.md) · [Phase 4 — Wallet & financial](./PHASE4_WALLET_DING_FINANCIAL.md) · [Phase 5 — Game engine](./PHASE5_GAME_ENGINE_REDIS_CONCURRENCY.md)

**Caveat:** Live Supabase project may differ slightly from `schema.sql` snapshot; validate grants/RLS on the deployed branch before remediation.

---

## 1. Authentication architecture

### 1.1 Supabase Auth integration

| Layer | Mechanism | Location |
|-------|-----------|----------|
| Browser session | `@supabase/ssr` cookie client | `lib/supabaseClient.ts` |
| Middleware | Refresh session cookies | `lib/supabase/middleware.ts`, root `middleware.ts` |
| Server Components | Anon key + cookies (RLS-bound) | `lib/supabase/server.ts` |
| API routes (player) | Verify **Bearer JWT** via anon client `getUser(token)` | `lib/supabaseServer.ts` → `getUserFromRequest` |
| API routes (admin) | Bearer JWT + **role read via service role** | `getAdminSessionOrThrow` / `getAdminContextOrThrow` |
| Wallet transfer API | Bearer JWT + **user-scoped** RPC (`createUserClientFromAccessToken`) | `app/api/admin/wallet/transfer/route.ts` |
| Wallet adjust API | Bearer JWT gate + **service role** RPC | `app/api/admin/wallet/adjust/route.ts` |
| Game Engine | Bearer JWT verified with service client | `game-engine/src/http/auth.ts` |

**Login/signup:** Username → synthetic email `@dingmoney.org` (`lib/auth-helpers.ts`).  
`LoginForm` / `SignupForm` use `signInWithPassword` / `signUp` (`components/auth/LoginForm.tsx`, `SignupForm.tsx`).

**Post-login routing:** Role from `public.users` (preferred) with fallback to JWT `user_metadata` / `app_metadata` for UI only (`LoginForm.tsx` ~77–87). Suspended players rejected after DB read.

**Hard exit / sign-out:** `lib/auth/signOutInBackground.ts`, `lib/auth/hardExit.ts` (Phase 1).

### 1.2 JWT validation quality

| Path | Validates JWT? | Notes |
|------|----------------|-------|
| Player `/api/*` | Yes (Bearer) | Cookie-only calls get **401** |
| Admin `/api/*` | Yes (Bearer) | Same |
| Admin dashboard snapshot | Bearer **or** cookie session | `resolveAdminDashboardRequestAuth.ts` |
| Middleware | `getUser()` refresh | Does **not** authorize API |
| Direct Supabase RPC from browser | Supabase validates JWT | **`auth.uid()`** in functions |
| Next.js + `createServiceClient()` | JWT checked at route, then **RLS bypass** | Authorization must be in **route code** |

### 1.3 Role system (application)

| Role | `UserRole` | Panel access (app rules) |
|------|------------|---------------------------|
| Player | `player` | Player PWA |
| Agent | `agent` | `app/agent/*`; **also** passes `getAdminSessionOrThrow` for many `/api/admin/*` |
| Super | `super` | Same as agent for API gate |
| Admin | `admin` | `admin_sub_role` splits admin panel vs dev panel (`lib/auth/adminPanelRules.ts`) |

**Admin sub-roles:** `manager`, `finance`, `support`, `room`, `dev_panel` — dev panel requires `admin_sub_role === 'dev_panel'`.

---

## 2. Database tables (catalog)

Tables and views identified in `supabase/schema.sql` (public unless noted):

| Table / view | RLS enabled (schema) | Notes |
|--------------|----------------------|--------|
| `users` | Yes | SELECT via `can_read_user`; limited UPDATE (referral_code) |
| `user_profiles` | Yes | Own row only (insert/read/update) |
| `user_profiles_old_backup` | Yes | Admin only |
| `user_commissions` | Yes | Owner + hierarchy read; writes service_role only |
| `user_notes` | Yes | Admin/agent/super scoped |
| `wallets` | Yes | Own + hierarchy SELECT; writes service_role / DEFINER RPCs |
| `transactions` | Yes | Own + hierarchy SELECT; insert service_role |
| `commissions_log` | Yes | Admin/agent/super SELECT policies |
| `ding_balances`, `ding_transactions` | Yes | Own user |
| `rooms` | Yes | **`rooms_read_public`** — SELECT for all |
| `draws` | Yes | **`draws_read_public`** — SELECT for all |
| `tickets` | Yes | Owner + **public read in waiting/cancelled rooms** |
| `marks` | Yes | Admin SELECT; writes service_role |
| `results`, `room_winners` | Yes | Player/agent/super/admin scoped reads |
| `room_templates`, card pool tables | Yes | Admin write; templates readable if not inactive |
| `draw_jobs`, `heartbeat_log` | Yes | Mostly service_role write; admin read |
| `tournaments` | Yes | SELECT active users; INSERT admin/super; **no broad UPDATE policy in snapshot** (RPC/migration locked) |
| `tournament_*` (entries, payouts, rounds, …) | Yes | Mix of own/participant/admin/service |
| `player_affiliation`, `player_signups` | Yes | Affiliation read scoped; **signups INSERT `WITH CHECK (true)`** |
| `invitation_links` | Yes | **`anyone_validate_codes` SELECT true** |
| `entry_banners`, `admin_audit_log`, `admin_permissions` | Yes | Admin/manager patterns |
| `app_runtime_flags` | **No RLS in schema** | **GRANT ALL to anon/authenticated** |
| `debug_room_status_log` | **No RLS in schema** | **GRANT ALL to anon/authenticated** |
| `dev_player_configs`, `dev_room_schedules`, … | Migrations enable RLS | **Not reflected in schema policy block**; grants exist on `dev_room_schedules` |
| `dev_player_settings`, join presets (migrations) | RLS enabled in migrations | Access via **Next dev-panel API + service role** |
| Heartbeat partitions | (part of heartbeat_log) | — |
| `tournament.template_reservations`, `tournament.tournament_tick_log` | tournament schema | Engine/service |
| Views: `v_lobby_online_players`, `v_lobby_active_players`, `v_row_hits`, `vw_finance_*`, … | No RLS on views | **GRANT SELECT to anon/authenticated** |

---

## 3. RLS summary by sensitive table

Legend: **S** SELECT, **I** INSERT, **U** UPDATE, **D** DELETE.

### 3.1 Identity & hierarchy

**`users`** (RLS on)

| Op | Policy gist | `auth.uid()`? |
|----|-------------|---------------|
| S | `can_read_user(id)` — self, admin, agent downline, super tree | Via SECURITY DEFINER helper |
| S | Referral rows public for agent/super/admin with `referral_code` (incl. **anon**) | Partially public |
| S | Tournament co-participants | `can_read_user_in_tournament` |
| U | Own `referral_code` only if role admin/agent/super | Yes; **cannot change `role` via WITH CHECK** |

**Violations / notes:** No client UPDATE policy for `role`/`status` — good. **`GRANT ALL` on table** still present; RLS must hold. Signup/onboarding uses **`rpc_register_player`** / trigger **`handle_new_user`** (SECURITY DEFINER) to set role/parent.

**`user_profiles`** — own row only for S/I/U.

### 3.2 Financial

**`wallets`** — S: own + `wallets_select_hierarchy` / agent/super/admin paths. **No authenticated I/U/D** (service_role policies for engine).

**`transactions`** — S: own + extensive `tx_admin_agent_super_read` hierarchy. **I: service_role only.**

**`commissions_log`** — S: admin/agent/super policies; no player write.

**Risk:** Direct **`fn_wallet_apply_delta`** bypasses RLS entirely (SECURITY DEFINER, **no caller check**) — see §6.

### 3.3 Game state

**`rooms`** — **S: `USING (true)`** → any role (even anon if granted) reads all room rows including seeds/metadata columns subject to column grants.

**`draws`** — **S: public** → full draw history readable.

**`tickets`** — S: owner; **plus all tickets in `waiting`/`cancelled` rooms** → card assignments visible pre-game.

**`results`** — S: winner, room member, agent/super/admin hierarchy.

### 3.4 Tournaments

**`tournament_entries`** — I/U: own user + open registration; **S: all entries in active tournaments for any authenticated user** (`tournament_entries_select_public_active`).  
Client flow: hold via **`fn_tournament_wallet_hold`** then **upsert** entry (`TournamentRoomScreen.tsx`) — amount/tickets must align with holds (verify triggers in Phase 4).

**`tournaments`** — INSERT admin/super; SELECT authenticated active users; direct table writes revoked in migration for UPDATE/DELETE (prefer RPC).

### 3.5 Operational / debug (high concern)

**`app_runtime_flags`** — **No RLS** + **GRANT ALL** → client could read/write **`global_registration_locked`** if PostgREST exposes table.

**`debug_room_status_log`** — **No RLS** + **GRANT ALL** → insert/read debug rows.

---

## 4. SECURITY DEFINER RPCs (authorization-critical)

| Function | Caller check | Grant to anon/auth | Risk |
|----------|--------------|-------------------|------|
| `fn_wallet_apply_delta` | **None** (any `p_user_id`) | **Yes** | **CRITICAL** wallet write |
| `fn_wallet_transfer_panel` | `auth.uid()` + role hierarchy | Yes | Medium (logic enforced) |
| `fn_system_join_or_create_room` | `auth.role() = service_role` | Yes (harmless for anon) | Low direct abuse |
| `fn_join_or_create_room` | `auth.uid()` + player checks | Yes | Intended player join |
| `fn_cancel_waiting_room(3-arg)` | Uses **`p_user` as actor** | Yes | **HIGH** impersonation |
| `fn_heartbeat_tick` | **None** | Yes | **CRITICAL** DoS/state |
| `rpc_pick_draw_jobs` | **None** | Yes | **CRITICAL** queue abuse |
| `fn_generate_card_pool` | **None** | Yes | **CRITICAL** |
| `fn_admin_games_report` | **None** | Yes | **HIGH** leak |
| `fn_tournament_wallet_hold` | `auth.uid()` | authenticated | Low |
| `rpc_register_player` | `auth.uid()` | Yes | Sets role=player only |
| `can_read_user` / `is_admin_active` | Helpers for RLS | EXECUTE typical | Low |

Full grant list: `schema.sql` § GRANT ON FUNCTION (lines ~15600–16100).

---

## 5. Service role indirect execution (application)

Pattern: **Validate JWT in Next route → `createServiceClient()` → read/write any row.**

| Route / flow | JWT required? | Service role action | App-level auth sufficient? |
|--------------|---------------|---------------------|----------------------------|
| `/api/player/live-room`, `gameroom` | Yes | Read all tickets/cards in room | **Weak** — no room membership check |
| `/api/player/room-results` | Optional | Read `room_seed`, results | **No** — public seed leak |
| `/api/player/card-pool/definitions` | Yes | Full pool download | **No** — any player |
| `/api/admin/wallet/adjust` | Yes (agent+) | `fn_wallet_apply_delta` for arbitrary `userIds` | **No** — DB does not check actor |
| `/api/player/tournament-*-tables` | **No** | Tournament/user aggregates | **No** |
| `/api/dev-panel/*` | Yes (dev_panel) | Full dev tables | Gate OK if sub-role enforced |
| Game Engine commands | Yes | `fn_system_join_or_create_room` | OK (service_role + verified user id) |
| Browser `supabase.rpc(...)` | JWT (or anon) | Depends on function | **Many dangerous GRANTs** |

**Safer pattern (reference):** `app/api/admin/wallet/transfer/route.ts` uses **`createUserClientFromAccessToken`** so **`fn_wallet_transfer_panel`** sees correct `auth.uid()`.

---

## 6. Privilege escalation paths

| Path | Feasible? | Mechanism |
|------|-----------|-----------|
| **Player → Agent/Super/Admin** (DB role) | **Unlikely via RLS** | No UPDATE policy on `users.role` for players |
| **Player → Agent** (metadata) | **UI only** | JWT metadata not used for server writes if `users` row correct |
| **Player → financial admin** | **Yes (RPC)** | `fn_wallet_apply_delta` with victim `p_user_id` |
| **Player → game operator** | **Yes (RPC)** | `fn_heartbeat_tick`, `rpc_pick_draw_jobs` if granted |
| **Agent → Admin** | **Unlikely via RLS** | `is_admin_active()` requires admin role |
| **Agent → other agent’s players** | **Partial** | Hierarchy policies; affiliation/parent_id dependent |
| **Agent → wallet adjust any user** | **Yes (API)** | `/api/admin/wallet/adjust` + service RPC |
| **Authenticated → impersonate cancel** | **Yes (RPC)** | 3-arg `fn_cancel_waiting_room` with victim UUID |
| **Any → lock all registration** | **Possible** | `app_runtime_flags` without RLS |

---

## 7. IDOR / BOLA scenarios (representative)

| ID | Severity | Attack scenario | Affected | Required access | Impact |
|----|----------|-----------------|----------|-----------------|--------|
| P3-CRIT-1 | **CRITICAL** | Call `fn_wallet_apply_delta` via Supabase client with victim UUID and positive delta | RPC / `game_finance` | Authenticated or anon key + optional JWT | Arbitrary balance credit/debit |
| P3-CRIT-2 | **CRITICAL** | POSTgREST `fn_heartbeat_tick` / `rpc_pick_draw_jobs` | DB RPC | anon/authenticated grant | Game loop manipulation |
| P3-HIGH-1 | **HIGH** | Call `fn_cancel_waiting_room(room, false, victim_id)` | RPC | Authenticated | Cancel/refund another user’s waiting room |
| P3-HIGH-2 | **HIGH** | GET `/api/player/room-results?roomId=` | API route | None / optional JWT | **room_seed** disclosure |
| P3-HIGH-3 | **HIGH** | GET live-room/gameroom for `roomId` not joined | Next API + service role | Valid player JWT | Other players’ cards/tickets |
| P3-HIGH-4 | **HIGH** | SELECT/UPDATE `app_runtime_flags` via Supabase | Table | authenticated/anon | Global registration lock tampering |
| P3-HIGH-5 | **HIGH** | `fn_admin_games_report` with date range | RPC | authenticated | Cross-tenant game/finance stats |
| P3-MED-1 | **MEDIUM** | Read all `draws` / `rooms` via RLS public SELECT | Tables | Any logged-in user | Recon, timing, seed hashes |
| P3-MED-2 | **MEDIUM** | Read tickets in waiting rooms | `tickets_public_read_waiting` | Authenticated | Pre-game card mapping |
| P3-MED-3 | **MEDIUM** | SELECT `tournament_entries` for active tournaments | RLS policy | Authenticated | Entry counts / user participation |
| P3-MED-4 | **MEDIUM** | SELECT `vw_finance_base` / earnings views | Views | anon/authenticated | Financial analytics exposure (depends on view definition) |
| P3-MED-5 | **MEDIUM** | Agent calls `/api/admin/wallet/adjust` on non-downline UUID | API | Agent JWT | Debit/credit if RPC succeeds |
| P3-MED-6 | **MEDIUM** | Upsert `tournament_entries` with inflated `amount` without matching hold | Client + RLS | Player JWT | Depends on DB constraints/triggers |
| P3-LOW-1 | **LOW** | Enumerate referral codes | `users_select_referral_public` | anon/authenticated | Marketing/referral recon |

---

## 8. Authorization matrix (intended vs observed)

**Legend:** ✅ allowed (intended) · ⚠️ allowed (undesired/gap) · 🔧 via RPC only · ❌ denied · **S** service bypass

| Resource | Player | Agent | Super | Admin | System (service/engine) |
|----------|--------|-------|-------|-------|-------------------------|
| Own wallet balance (read) | ✅ RLS | ✅ hierarchy | ✅ hierarchy | ✅ | **S** |
| Downline wallet (read) | ❌ | ✅ RLS | ✅ RLS | ✅ | **S** |
| Wallet write (direct SQL) | ❌ | ❌ | ❌ | ❌ | **S** / DEFINER RPC |
| Wallet adjust (panel) | ❌ | 🔧 transfer RPC / ⚠️ adjust API | ⚠️ same | ✅ | **S** adjust API |
| Join room / buy cards | 🔧 `fn_join_*` / engine | 🔧 | 🔧 | 🔧 | **S** `fn_system_*` |
| Room/draw read (all rooms) | ⚠️ public RLS | ⚠️ | ⚠️ | ⚠️ | **S** |
| Live room all cards (API) | ⚠️ IDOR | ⚠️ | ⚠️ | ⚠️ | **S** |
| Card pool definitions (API) | ⚠️ full pool | ⚠️ | ⚠️ | ⚠️ | **S** |
| Tournament register | 🔧 hold RPC + entry RLS | 🔧 | 🔧 | 🔧 | **S** |
| Tournament admin CRUD | ❌ table | ❌ / 🔧 RPC if super | 🔧 RPC | 🔧 RPC | **S** |
| User role change | ❌ RLS | ❌ | ❌ | 🔧 API `set-role` | **S** |
| Dev player config | ❌* | ❌ | ❌ | dev_panel API | **S** |
| Global registration lock | ⚠️ table? | ⚠️ | ⚠️ | 🔧 admin API | **S** |
| Commissions / reports | ❌ / own tx | ✅ scoped | ✅ scoped | ✅ | **S** |
| Admin audit log | ❌ | ❌ | ❌ | ✅ RLS | **S** |
| PostgREST dangerous RPCs | ⚠️ **GRANT** | ⚠️ | ⚠️ | ⚠️ | **S** |

\*Dev tables: RLS on with **no client policies** in migrations → default deny for authenticated; **service role** used by dev-panel API.

### Matrix violations (summary)

1. **Financial RPC `fn_wallet_apply_delta`** — Player/agent should ❌; observed ⚠️ **GRANT + no auth**.  
2. **`/api/admin/wallet/adjust`** — Agent should be limited to downline; observed ⚠️ service RPC without hierarchy.  
3. **Public game reads + API service role** — Player should see only participating rooms; observed ⚠️.  
4. **`app_runtime_flags`** — Should be admin/system only; observed ⚠️ **no RLS**.  
5. **Cancel room 3-arg RPC** — Should bind actor to `auth.uid()`; observed ⚠️ **`p_user` trusted**.

---

## 9. Application authorization (non-RLS)

| Control | Location | Gap |
|---------|----------|-----|
| Admin API role gate | `getAdminSessionOrThrow` — allows admin, super, **agent** | Not same as `canAccessAdminPanel` (admin-only UI) |
| Admin UI gate | `requireAdminPanelAccess` — **admin** without dev_panel | Agents use `/agent` not `/admin` |
| Dev panel | `getDevPanelContextOrThrow` + `verifyDevPanelAccess` | OK |
| Set role | `app/api/admin/users/set-role/route.ts` | Hierarchy rules in route + target checks |
| Set password | admin role only in route | OK |
| Card pool generate | admin role only in route | OK |
| Global lock PATCH | admin only in route | OK; table RLS still weak if direct Supabase |
| Player API | Bearer only | Good; then service role over-reads |

---

## 10. Realtime & triggers (authorization angle)

- **Realtime:** Subscriptions on rooms/tickets/wallets (`GameRoomScreen`, `useWalletBalances`, etc.) — authorization = **RLS on underlying tables** + Supabase Realtime policies (not fully enumerated in repo; verify in Supabase dashboard).
- **Triggers:** e.g. `trg_debug_rooms_status` writes **`debug_room_status_log`** on room status change — any user who can UPDATE `rooms` would be dangerous; room UPDATE policies must be service-only (verify — **rooms** may lack UPDATE policy for authenticated = deny).

---

## 11. Phase 4 investigation backlog

1. Confirm **live** Supabase: RLS on `app_runtime_flags`, `debug_room_status_log`, all `dev_*` tables.  
2. Enumerate **EXECUTE grants** on all `SECURITY DEFINER` functions vs production.  
3. Tournament entry: triggers enforcing **`amount` / `tickets_count` vs wallet hold**.  
4. Realtime **publication** row filters.  
5. Storage policies (`avatars`, banner bucket) — migrations partial.  
6. **`handle_new_user`** vs **`rpc_register_player`** — which path signup uses in prod.  
7. Map **`admin_sub_role`** to API routes (finance vs support vs room).  
8. Test IDOR: live-room API for non-member `roomId`.  
9. Review **`vw_finance_*`** view definitions for PII/leakage.  
10. Align **`getAdminContextOrThrow`** with product intent (agent vs admin APIs).

---

## Appendix A — Helper functions (RLS)

**`can_read_user(target)`** (`schema.sql` ~4161): admin active → all; self; agent → `parent_id = agent`; super → two-level tree. Uses **`row_security off`** inside DEFINER.

**`is_admin_active()`** (~7936): `role = admin` and `status = active` — **does not** treat `admin_sub_role` finance/support separately (sub-role is app-layer).

**`is_tournament_participant(tournament_id)`** (~7964): entry in active tournament statuses.

---

## Appendix B — Auth-related files (code index)

| File | Role |
|------|------|
| `middleware.ts` | Host redirect; cookie refresh |
| `lib/supabase/middleware.ts` | Session refresh |
| `lib/supabaseServer.ts` | JWT verify, admin context, service client |
| `lib/auth/adminPanelRules.ts` | Panel routing rules |
| `lib/auth/adminPanelAccessServer.ts` | Server panel gate |
| `lib/auth/resolveAdminDashboardRequestAuth.ts` | Dashboard Bearer/cookie |
| `components/auth/LoginForm.tsx` | Sign-in + role/suspension |
| `components/auth/SignupForm.tsx` | Referral validation + signUp |
| `app/api/admin/users/set-role/route.ts` | Role elevation (server) |
| `src/screens/TournamentRoomScreen.tsx` | Client RPC hold + entry upsert |

---

## Appendix C — Per-table RLS policy matrix (`schema.sql`)

**Key:** S/I/U/D = policy exists for role `authenticated` unless noted `service_role`, `anon`, or `true` (public). Empty = **no policy → deny** for that op (except `service_role` bypasses RLS).

| Table | RLS | S | I | U | D | Cross-user / IDOR notes |
|-------|-----|---|---|---|---|-------------------------|
| `admin_audit_log` | Yes | Admin | — | — | — | Admin-only read |
| `admin_permissions` | Yes | Admin; manager modify | — | Manager | — | Sub-role in policy |
| `app_runtime_flags` | **No** | **Table grant ALL** | **ALL** | **ALL** | **ALL** | **No RLS — critical** |
| `card_numbers` | Yes | Admin | Admin | Admin | Admin | OK |
| `card_pool_cards` | Yes | Admin | Admin | Admin | Admin | OK |
| `card_pools` | Yes | Admin | Admin | Admin | Admin | OK |
| `commissions_log` | Yes | Admin/agent/super | — | — | — | OK |
| `debug_room_status_log` | **No** | **Grant ALL** | **ALL** | **ALL** | **ALL** | **No RLS** |
| `dev_player_configs` | Not in RLS block* | Grant? | — | — | — | Migrations: RLS on, no client policies |
| `dev_room_schedules` | Not in RLS block* | Grant ALL | — | — | — | Same |
| `ding_balances` | Yes | Own | — | **Own (UPDATE)** | — | UPDATE on own row (Realtime path) |
| `ding_transactions` | Yes | Own | — | — | — | OK |
| `draw_jobs` | Yes | Admin | service | service | service | OK |
| `draws` | Yes | **Public (`true`)** | — | — | — | All draws readable |
| `entry_banners` | Yes | Active + admin | Manager | Manager | Manager | OK |
| `heartbeat_log` (+ partitions) | Yes | Admin | service | service | service | OK |
| `invitation_links` | Yes | **Public validate** + own | Inviter | Inviter | — | Code enumeration |
| `marks` | Yes | Admin | service | service | service | OK |
| `player_affiliation` | Yes | Hierarchy | service | service | service | OK |
| `player_signups` | Yes | Own | **`WITH CHECK (true)`** | — | — | Any auth can insert? |
| `results` | Yes | Player/room/hierarchy | — | — | — | OK |
| `room_templates` | Yes | Auth non-inactive + admin | Admin | Admin | Admin | OK |
| `room_winners` | Yes | Own + admin | service | service | service | OK |
| `rooms` | Yes | **Public** | — | — | — | Full room row read |
| `tickets` | Yes | Own + **waiting/cancelled public** | — | — | — | Pre-game leak |
| `tournament_*` (8 tables) | Yes | Mixed own/admin/participant | Mostly service | Mostly service | Mostly service | See §3.4 |
| `tournaments` | Yes | Active users | Admin/super | —† | —† | †Direct D/U revoked in migration |
| `transactions` | Yes | Own + hierarchy | service only | — | — | OK |
| `user_commissions` | Yes | Owner/hierarchy/admin | service | service | service | OK |
| `user_notes` | Yes | Admin/agent/super scoped | Same policy | Same | Same | Broad USING on write |
| `user_profiles` | Yes | Own | Own | Own | — | `user_id` bound |
| `user_profiles_old_backup` | Yes | Admin | Admin | Admin | Admin | OK |
| `users` | Yes | `can_read_user` + referral public | — | Own referral only | — | **No role UPDATE for players** |
| `wallets` | Yes | Own + hierarchy | — | service | — | OK |
| `tournament.template_reservations` | (tournament schema) | — | — | — | — | Engine/service |
| `tournament.tournament_tick_log` | (tournament schema) | — | — | — | — | Engine/service |

\*`dev_*` tables exist in dump; RLS enablement may exist only in `winway/sql/migrations/` — confirm on live DB.

### Views (no RLS; inherit underlying grants)

| View | Grant anon/auth | Risk |
|------|-----------------|------|
| `v_lobby_online_players` | SELECT | Aggregate count only |
| `v_lobby_active_players` | SELECT | Depends on definition |
| `v_row_hits` | SELECT | Ticket hit data |
| `vw_finance_base`, `vw_finance_earnings_by_role`, … | SELECT | Finance reporting exposure |

---

## Appendix D — RPC EXECUTE grants (anon / authenticated highlights)

| Function | anon | authenticated | Caller validation |
|----------|------|---------------|-------------------|
| `public.fn_wallet_apply_delta` | **Yes** | **Yes** | **None** |
| `game_finance.fn_wallet_apply_delta` | No | **Yes** | **None** (direct schema call) |
| `public.fn_cancel_waiting_room` (2-arg) | Yes | Yes | Uses `auth.uid()` when 2-arg |
| `public.fn_cancel_waiting_room` (3-arg) | Yes | Yes | **`p_user` passed through** |
| `public.fn_wallet_transfer_panel` | Yes | Yes | `auth.uid()` + hierarchy |
| `public.fn_join_or_create_room` | Yes | Yes | Player checks inside |
| `public.fn_heartbeat_tick` | Yes | Yes | **None** (verify in schema) |
| `public.rpc_pick_draw_jobs` | Yes | Yes | **None** |
| `public.fn_generate_card_pool` | Yes | Yes | **None** |
| `public.fn_admin_games_report` | Yes | Yes | **None** |
| `public.rpc_register_player` | Yes | Yes | `auth.uid()` |

---

*End of Phase 3 report.*
