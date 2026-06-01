# Agent / Referral System — System Reality Map

> STRICT EXTRACTION. Documents only what exists in code + database. No proposed
> behavior. Sources: live DB introspection + codebase exploration.

## What this system is (as implemented)

A multi-tier operator hierarchy where **players are bound to an `agent` and/or
`super`** at signup, and that binding drives both commission routing and
data-visibility (RLS). There is no separate "affiliate dashboard product" beyond the
shared agent/super panel and referral-code management.

Roles (`user_role`): `admin` → `super` → `agent` → `player`.

## Data model

| Object | Role |
| --- | --- |
| `users.role` | `admin` / `super` / `agent` / `player`. |
| `users.parent_id` | Direct hierarchy parent (player→agent or player→super; agent→super). |
| `users.referral_code` | Code owned by an `admin`/`super`/`agent` (regex `^[A-Z0-9]{3,8}$`). The signup mechanism. |
| `player_affiliation(user_id, agent_id, super_id)` | Resolved player→agent/super mapping. **Basis of commission routing + RLS hierarchy.** 42 rows. |
| `user_commissions(user_id, agent_commission, super_commission)` | Commission **rates** for an agent/super. 5 rows. |
| `invitation_links(code, inviter_id, inviter_role, max_uses, current_uses, expires_at, is_active, internal_name/note)` | Unique invite codes for player signup. 0 rows (table exists; alternate path). |
| `player_signups(invitation_link_id, player_id, signed_up_at)` | Log of invitation-link signups. 0 rows. |

> Two referral mechanisms coexist: **(1) `users.referral_code`** (the path the live
> app uses) and **(2) `invitation_links` codes** (`signup_player_with_code` RPC).

## How a player gets bound (two implemented paths)

### Path 1 — `users.referral_code` via Supabase Auth (the path the app uses)
- Frontend `components/auth/SignupForm.tsx`:
  1. Validates username/password.
  2. Queries `users` for a row where `referral_code = <entered>` and `status='active'`;
     rejects if that referrer is a `player`.
  3. `supabase.auth.signUp` with `options.data = { username, referral_code }`.
  4. Auto `signInWithPassword` → `/post-login`.
- DB trigger `public.handle_new_user()` (on `auth.users`):
  - Requires non-empty `referral_code` in metadata; rejects player codes.
  - Resolves referrer; sets `users.parent_id = referrer`.
  - Agent referrer → `agent_id = referrer`, `super_id` = referrer's `parent_id` (if super).
  - Super referrer → `super_id = referrer`, `agent_id = NULL`.
  - Admin referrer → both NULL.
  - Inserts `users` (player), `player_affiliation`, `wallets`, `ding_balances`,
    `user_profiles`.
- Keep-in-sync: `game_core.fn_sync_player_affiliation_for_user(user_id)` + trigger
  `trg_sync_player_affiliation_from_users` on `users` (INSERT/UPDATE of `role`,
  `parent_id`) re-derive `player_affiliation` from `parent_id`. `trg_validate_affiliation_roles`
  validates agent/super roles BEFORE write.

### Path 2 — invitation code RPC `game_core.signup_player_with_code(code, username, nickname, country, language)`
- Validates `invitation_links` (active, not expired, uses remaining).
- Creates `users` (player) + `user_profiles`; resolves agent/super from `inviter_role`
  (agent → agent_id + super from agent's affiliation; super → super_id; admin → falls
  back to first existing super); inserts `player_affiliation`; creates wallet;
  increments `current_uses`; logs `player_signups`.
- Enforces "player must have at least one of agent/super".
- Validation helper RPC: `game_core.validate_invitation_code(code)`.

> NOTE: The Next.js app contains **no `invitation`-related code** (grep: 0 matches).
> The invitation-link path exists only in the DB. `handle_new_user` is referenced in
> docs/migrations but is not defined in the repo's tracked SQL migrations (it lives
> in the live DB).

## Referral-code management (agent/super/admin)

- UI: `app/agent/settings/page.tsx` and `app/admin/settings/page.tsx` (same helpers).
- Helpers in `lib/auth-helpers.ts`:
  - `validateReferralCodeFormat` (client regex 3–8 chars `A–Z0–9`).
  - `checkReferralCodeAvailable` (queries `users.referral_code`; optional
    `referral_code_history` table — no RPC).
  - `getReferralCodeHistory` → RPC `get_user_referral_code_history(p_user_id)`,
    fallback to `referral_code_history` table.
  - `updateReferralCode` → `users.update({ referral_code })` for current user.
  - `getCurrentReferralCode` → reads `users.referral_code`.
- RLS: `users` policy `"Users can update own referral_code"` — `auth.uid()=id`,
  role ∈ {admin,agent,super}, and code is NULL or matches `^[A-Z0-9]{3,8}$`.
- Public read: `users_select_referral_public` lets anon/authenticated read referral
  rows where `referral_code IS NOT NULL AND status='active' AND role IN (agent,super,admin)`.
- Repo SQL (present, not called from Next.js): `validate_referral_code.sql`,
  `check_referral_code_available.sql`, `get_user_referral_code_history.sql`,
  `save_referral_code_history.sql` (trigger), and the update-referral RLS migration.

## Agent / super panel (`app/agent/**`)

`post-login` routes **both** `agent` and `super` to `/agent/dashboard` (same panel).

| Route | Purpose |
| --- | --- |
| `app/agent/layout.tsx` | `ClientAuthGuard` + `DingHeader` (`balanceType="toman"`); `EntryBannerModal` on dashboard. |
| `app/agent/dashboard/page.tsx` | Period stats (day/week/month/range) via `services/dashboard.ts`; referral code; nav to tournaments report, `/admin/games`, users, transactions. |
| `app/agent/settings/page.tsx` | Referral-code management (helpers above). |
| `app/agent/tournaments/report/page.tsx` | `TournamentsReportPage` (`backPath=/agent/dashboard`). |
| `app/agent/users/page.tsx`, `users/[userId]/page.tsx` | `ManagedUsersList` / `UserAccountPage` (shared with admin). |
| `app/agent/transactions/page.tsx` | `TransactionsManager` (cash desk + history). |

Agents/supers reuse admin components/services but are **scoped by hierarchy** in
both code and RLS (see below).

## Hierarchy scoping (visibility)

- Frontend `services/users.ts` (`loadManagedUsers`), `services/transactions.ts`
  (`loadTransactionHistory`), `services/user-account.ts` scope by `users.parent_id`
  + `player_affiliation` (`agent_id`/`super_id`).
- RLS enforces the same at the DB:
  - `wallets` / `transactions`: agent sees own players (parent or
    `player_affiliation.agent_id`); super sees own agents+players (parent chain or
    `player_affiliation.super_id`); admin sees all non-admin users.
  - `user_commissions`: `user_commissions_select_agent` / `_super` /
    `_owner` / `_admin`.
  - `commissions_log`: agent reads where `agent_id=uid`; super where `super_id=uid`.
  - `user_notes`: agent/super may read/write notes on their subtree.

## Money movement by agents/supers
- Agents/supers can move funds to/from their subtree via the panel
  (`fn_wallet_transfer_panel` / `_bulk`), and adjust (`fn_adjust_wallet_manual`).
  Hierarchy is enforced inside those `SECURITY DEFINER` functions (agent→own players;
  super→own agents/players). See `financial-system.md`.

## Commission earning
- Agents/supers **earn commission** on their players' ticket purchases and tournament
  entries. Rates live in `user_commissions`; routing/payout is documented in
  `Commission-System.md`.

## Current-state notes (recorded, not judged)
- `invitation_links` / `player_signups` are empty and unused by the app UI; the live
  signup path is `referral_code` + `handle_new_user`.
- `players` cannot be referrers (enforced in both `SignupForm` and `handle_new_user`).
- An admin referrer leaves both `agent_id` and `super_id` NULL (path 1); the
  invitation-link path forces a fallback super for admin inviters.
