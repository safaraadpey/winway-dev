# Admin System — System Reality Map

> STRICT EXTRACTION. Documents only what exists in code + database. Frontend is a
> Next.js 14 app; admin routes are served on a separate host.

## Routing / host

- `middleware.ts`: on the main host, `/admin/*` is redirected to `ADMIN_APP_HOST`
  (default `admin.dingmoney.org`). No auth logic in middleware.
- `app/admin/layout.tsx`: wraps admin pages in `ClientAuthGuard` + `DingHeader`;
  shows `EntryBannerModal` only on `/admin/dashboard`. **No role check in the layout.**
- `components/auth/ClientAuthGuard.tsx`: requires a Supabase session only; redirects
  to `/login` if missing. **Does not verify `role === 'admin'`** — role/permission
  enforcement happens at the API and RLS layers, plus dashboard menu gating.

## Admin pages (`app/admin/**`)

| Route | Purpose |
| --- | --- |
| `dashboard/page.tsx` | Home; financial summary tabs (day/week/month/range); menu gated by `AdminPermissions` + `adminzero` checks. Data via `services/dashboard.ts`. |
| `tournaments/page.tsx` | List tournaments (client Supabase). |
| `tournaments/create/page.tsx` | Create → RPC `fn_admin_create_tournament`. |
| `tournaments/[id]/page.tsx` | Detail: entries, round rooms, prize transactions. |
| `tournaments/[id]/edit/page.tsx` | Edit → `fn_admin_update_tournament`, `fn_admin_set_tournament_status`, `fn_admin_delete_tournament`. |
| `tournaments/report/page.tsx` | `TournamentsReportPage` → `/api/admin/tournaments/report`. |
| `games/page.tsx` | Games report + global registration lock toggle. |
| `room-templates/page.tsx` | Room template CRUD (direct Supabase on `room_templates`). |
| `settings/page.tsx` | Admin referral-code management. |
| `account/page.tsx` | Generic `ProfilePage`. |
| `users/page.tsx`, `users/[userId]/page.tsx` | `ManagedUsersList` / `UserAccountPage`. |
| `transactions/page.tsx` | `TransactionsManager` (bulk cash desk + history). |
| `admins/page.tsx` | `AdminsList` (sub-role + permissions); dashboard menu link **only for `adminzero`**. |
| `card-pool/page.tsx` | Card pool generate/poll/download; menu **only for `adminzero`**. |
| `entry-banner/**` | Banner list/create/edit/delete (direct Supabase + storage). |

**Page-level enforcement**: only `dashboard/page.tsx` hides menu items by
permission/sub-role/`adminzero`. Most admin routes rely on the login guard + API +
RLS; there are **no route-level sub-role guards** on most pages.

## Admin API routes (`app/api/admin/**`)

All authenticate via `getAdminContextOrThrow` / `getAdminJwtContextOrThrow`
(`lib/supabaseServer.ts`): Bearer token → `users.role`/`admin_sub_role` via service
client. Base allowed roles for most routes: `admin`, `super`, `agent`.

| Route | Method | Extra checks | DB / RPC | Audit action |
| --- | --- | --- | --- | --- |
| `users/set-role` | POST | hierarchy by actor role | `users` UPDATE, `user_commissions` UPSERT | `set_role` |
| `users/set-password` | POST | must be `adminzero`, `admin_sub_role NULL` | reads `admin_audit_log` (20-min cooldown), `auth.admin.updateUserById` | `admin_set_user_password` |
| `users/set-commission` | POST/GET | parent-tree rules | `users`, `user_commissions` | `set_user_commission_percent` |
| `users/toggle-suspension` | POST | sub-admin can't suspend an admin | `users` UPDATE status | `toggle_user_suspension` |
| `users/nicknames` | POST | admin/super/agent | `user_profiles` SELECT (≤2000) | — |
| `admins/set-sub-role` | POST | `verifyManagerAccess` (`admin_sub_role NULL`) | `users` UPDATE `admin_sub_role` | `set_sub_role` |
| `admins/toggle-status` | POST | `verifyManagerAccess` | `users` UPDATE status | `toggle_admin_status` |
| `wallet/transfer` | POST | JWT user-scoped | RPC `fn_wallet_transfer_panel` per user | `wallet_transfer_bulk` |
| `wallet/adjust` | POST | service client | RPC `fn_wallet_apply_delta` per user | `wallet_adjust_bulk` |
| `games/report` | GET | admin/super/agent | RPC `fn_admin_games_report` + tables | — |
| `tournaments/report` | GET | admin/super/agent | direct table queries (no RPC) | — |
| `dashboard/commission-summary` | GET | `role='admin'` | `users`, `transactions`, `commissions_log` (**not used by frontend**) | — |
| `runtime/global-registration-lock` | GET/POST | `role='admin'` | `app_runtime_flags` UPSERT/SELECT | `enable_/disable_global_registration_lock` |
| `card-pool/{generate,status,active,history,download}` | GET/POST | `role='admin'` | `card_pools`, `card_pool_cards`, RPC `fn_generate_card_pool` | `generate_card_pool` |

> Sub-role API accepts `null|finance|support|room` (frontend `manager` is mapped to
> NULL in `set-role`). **`bot_admin` is never referenced in the frontend/API.**

## Permission model (as implemented)

Two parallel systems:

### A. `admin_sub_role` (identity label) — `lib/auth-helpers.ts`
- Code type: `'manager' | 'finance' | 'support' | 'room'` (no `bot_admin`).
- `admin_sub_role IS NULL` (DB "مدیر کل") or frontend `'manager'` = full access.
- `canAccessSection('finance'|'support'|'room')`: NULL/`manager` see all; others only
  their own section.
- `canManageTransactions()`: admin NULL/`manager`/`finance`, plus `agent`/`super`
  (their subtree). `support`/`room` admins → false.

### B. `admin_permissions` table — `lib/admin-permissions.ts`
- `getCurrentAdminPermissions()`: admin with `admin_sub_role NULL` → all five flags
  `true`. Otherwise loads `admin_permissions` rows (`permission_key`, `granted`),
  defaulting missing keys to `true`.
- Permission keys (`src/types/admins.ts`): `rooms`, `users`, `transactions`,
  `entry_banner`, `admins`.
- Edited via `services/admins.ts` → `updateAdminPermissions` (direct client Supabase;
  requires actor `admin_sub_role NULL`). RLS: `admin_permissions` writes require
  manager (`role='admin' AND admin_sub_role IS NULL`).

### Dashboard menu gating (`dashboard/page.tsx`)
| Menu | Gate |
| --- | --- |
| اتاق‌ها (rooms) | `permissions.rooms` |
| تورنومنت‌ها | any admin |
| بازی‌ها | any admin |
| کاربران | `permissions.users` |
| تراکنش‌ها | `permissions.transactions` |
| بنر ورودی | `permissions.entry_banner` |
| مدیران | `id === adminzero.id` AND `permissions.admins` |
| استخر کارتها | `id === adminzero.id` only |
| حساب کاربری | always |

> The privileged single super-admin is identified by **username `adminzero`** in
> several places (set-password, card-pool/admins menus, tournament commission
> fallback admin). This is an implementation fact, not a role flag.

## RLS enforcement relevant to admins
- `is_admin_active()` gates admin reads on most operational tables.
- Manager-only writes: `admin_permissions`, `entry_banners`
  (`role='admin' AND admin_sub_role IS NULL`).
- `admin_audit_log` readable by `role='admin'`.
- Hierarchy reads on `wallets`/`transactions`/`commissions_log` give agents/supers
  scoped visibility to their subtree.

## Audit logging
- Writer `logAdminAction()` (`lib/supabaseServer.ts`) → `admin_audit_log`
  (`admin_id`, `action`, `target_table`, `target_id`, `payload`, `ip_address`,
  `user_agent`).
- Audited actions: `set_role`, `admin_set_user_password`,
  `set_user_commission_percent`, `toggle_user_suspension`, `set_sub_role`,
  `toggle_admin_status`, `wallet_transfer_bulk`, `wallet_adjust_bulk`,
  `generate_card_pool`, `enable_/disable_global_registration_lock`.
- **Not audited**: `updateAdminPermissions`/`deleteAdmin` (direct Supabase),
  room-template edits, entry-banner edits, client-side tournament RPCs.

## Admin sub-role discrepancy (factual)
| Source | Enum values |
| --- | --- |
| Live DB (`public.admin_sub_role`) | `finance`, `support`, `room`, `bot_admin` |
| Winway migration `sql/migrations/add_admin_sub_role.sql` | `manager`, `finance`, `support`, `room` |
| Frontend code (`auth-helpers.ts`) | `manager`, `finance`, `support`, `room` |

The frontend treats NULL (and the legacy `manager`) as full manager; the live DB
enum has `bot_admin` which no app code references. Recorded as-is.

## Components (`components/admin/**`)
- `TransactionsManager.tsx`: bulk cash desk via `transferWalletForUsersBulk`
  (→ `fn_wallet_transfer_panel`); imports adjust-bulk but the active submit path uses
  transfer. History tab reads `transactions`.
- `ManagedUsersList.tsx`: searchable/tree user list scoped by hierarchy.
- `UserAccountPage.tsx`: single-user panel (commission, suspension, role change,
  notes, wallet transfer, password for `adminzero`).
- `AdminsList.tsx`: sub-role + `admin_permissions` management.
- `RoomTemplatePanel.tsx`: room template form.
