# P2.2 — Independent Red Team Review of `fn_wallet_apply_delta`

> **Date:** 2026-08-02  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Mode:** Read-only (no SQL / ACL / migrations / code / commit / push)  
> **Stance:** Prior audits treated as untrusted. Goal: find **any** legitimate caller that still requires `authenticated` or `PUBLIC` EXECUTE on either function.

---

## Final recommendation

```
SAFE_TO_LOCK_WALLET_APPLY_DELTA
```

Lock both:

- `public.fn_wallet_apply_delta(...)`
- `game_finance.fn_wallet_apply_delta(...)`

to **`postgres` + `service_role` EXECUTE only** (revoke `PUBLIC`, `anon`, `authenticated`).

No repository evidence was found that any **legitimate** product path invokes these functions under the PostgREST/`authenticated` (or `anon`) role.

---

## Targets (live)

| Schema | Signature | Mode | Owner | Current ACL (proacl) | anon | auth | service |
|--------|-----------|------|-------|----------------------|------|------|---------|
| `public` | `fn_wallet_apply_delta(uuid,text,numeric,transaction_type,text,text,text,jsonb,boolean)` | **DEFINER** (LANGUAGE sql) | postgres | `{=X, postgres, anon, authenticated, service_role}` | true | true | true |
| `game_finance` | same args | **DEFINER** (plpgsql) | postgres | `{=X, postgres, authenticated, service_role}` | true* | true | true |

\*anon EXECUTE true via **PUBLIC** grant on the function.

**Schema USAGE (critical):**

| Schema | Who has USAGE |
|--------|----------------|
| `public` | anon, authenticated, service_role, postgres |
| `game_finance` | **postgres + service_role only** |

So direct PostgREST exposure for clients is effectively **`public.fn_wallet_apply_delta`**. The SoR function is reachable by clients only if they somehow have `game_finance` USAGE (they do not today) or via nested DEFINER.

**Bodies:** Neither function checks `auth.uid()`, `auth.role()`, JWT claims, or staff roles. They accept arbitrary `p_user_id` / delta.

---

## Complete dependency graph

```
public.fn_wallet_apply_delta                    [DEFINER, postgres]
  └── SELECT game_finance.fn_wallet_apply_delta  [DEFINER, postgres]
        ├── LOCK/UPSERT public.wallets
        └── INSERT public.transactions
```

No triggers and no cron jobs reference `fn_wallet_apply_delta` by name (live `pg_trigger` / `cron.job` search: empty).

---

## Complete caller graph (verified)

### A. Direct TypeScript / PostgREST callers of the RPC name

| Caller | Kind | DB role used | How role obtained | Evidence |
|--------|------|--------------|-------------------|----------|
| `app/api/admin/wallet/adjust/route.ts` | Next.js Admin API | **service_role** | `getAdminContextOrThrow` → `createServiceClient()` | Lines 19–20, 102–114: `supabase.rpc("fn_wallet_apply_delta", …)` |
| `apps/engines/bingo/src/finance/index.ts` → `walletApplyDelta()` | Railway adapter | **service_role** | `createSupabaseAdmin` uses `supabaseServiceRoleKey` | `finance/index.ts` 38–54; `db/supabase-admin.ts` |
| `services/transactions.ts` | Browser | **does not call RPC** | `fetch("/api/admin/wallet/adjust")` | HTTP to API only |

**Dead / unused direct adapter:** `walletApplyDelta()` is **exported but never imported/called** elsewhere in `apps/engines/bingo` (only definition site). Live settle path uses `finishRoomAndSettle` → `fn_finish_room_and_settle`, which nests `apply_delta` in SQL.

**Not found in repo (TS/JS):**

- Browser `.rpc("fn_wallet_apply_delta")`
- Server Actions calling it (`lib/tour/actions/*` are tour-only)
- Player APIs calling it
- Dynamic string RPC name construction for this function
- Mobile / native clients in this tree

### B. Nested SQL callers (all SECURITY DEFINER, owner `postgres`)

Live `pg_proc.prosrc LIKE '%fn_wallet_apply_delta%'` (excluding self):

| Parent | Mode | Owner | Invoked by (product) |
|--------|------|-------|----------------------|
| `public.fn_wallet_apply_delta` | DEFINER | postgres | Admin API / (unused) engine adapter |
| `public.fn_adjust_wallet_manual` | DEFINER | postgres | **No live TS** (orphan; ACL already service-locked) |
| `public.fn_tournament_wallet_hold` | DEFINER | postgres | Browser JWT → this parent (not apply_delta) |
| `public.fn_tournament_wallet_release` | DEFINER | postgres | Browser JWT → this parent |
| `game_finance.fn_wallet_hold_join` (5-arg) | DEFINER | postgres | Nested from join cores |
| `game_finance.fn_wallet_release_join` (5-arg) | DEFINER | postgres | Nested from cancel/janitor |
| `game_finance.fn_distribute_ticket_commission` | DEFINER | postgres | Nested from settle |
| `game_finance.fn_finish_room_and_settle` | DEFINER | postgres | Railway `settleRoomIfNeeded` |
| `tournament.fn_wallet_capture_join` | DEFINER | postgres | Tournament capture chain |
| `tournament.fn_payout_tournament` | DEFINER | postgres | Tournament ticks |
| `tournament.fn_settle_commission_payouts` | DEFINER | postgres | Tournament ticks |
| `tournament.fn_admin_refund_cancelled_tournament` | DEFINER | postgres | SQL-only today |

**INVOKER parents that call apply_delta:** **0** (all nested parents are DEFINER).

### C. Indirect product paths (do **not** call apply_delta with user JWT)

```
Player join (authenticated JWT)
  → public.fn_join_or_create_room [DEFINER]
    → game_core join core [DEFINER]
      → game_finance.fn_wallet_hold_join [DEFINER]
        → game_finance.fn_wallet_apply_delta   ← executes as postgres

Player tournament hold/release (authenticated JWT)
  → public.fn_tournament_wallet_{hold,release} [DEFINER]
    → game_finance.fn_wallet_apply_delta       ← executes as postgres

Cancel waiting (API service_role)
  → cancel RPC chain [DEFINER]
    → fn_wallet_release_join → apply_delta     ← postgres / service entry

Railway settle (service_role)
  → fn_finish_room_and_settle [DEFINER]
    → apply_delta                              ← postgres inside DEFINER
    (outer RPC itself requires service_role EXECUTE)
```

---

## Role analysis per edge

| Question | Answer | Evidence |
|----------|--------|----------|
| Does Admin adjust need `authenticated` EXECUTE on apply_delta? | **No** | Uses `createServiceClient()` / service_role |
| Does Railway need `authenticated` EXECUTE? | **No** | Service role key; settle nests SQL anyway |
| Does browser tournament/join need `authenticated` EXECUTE on apply_delta? | **No** | They call **parent** DEFINER RPCs; nested call runs as **owner postgres** |
| Does cron/trigger call apply_delta? | **No** | Empty search |
| Can `auth.uid()` appear in the JWT while apply_delta runs? | Yes, for nested DEFINER under a user JWT parent — but apply_delta **ignores** it | Function body has no auth checks |
| Can `auth.uid()` **legitimately** be the PostgREST role invoking apply_delta **directly**? | **No product path** in this repository | Only service_role direct callers |

### PostgreSQL privilege model (why nested survives lock)

For `SECURITY DEFINER` functions owned by `postgres`:

1. During execution, `current_user` is temporarily the owner (`postgres`).
2. `EXECUTE` checks on nested `fn_wallet_apply_delta` are therefore against **postgres**, not the original JWT role.
3. Revoking `authenticated` / `anon` / `PUBLIC` from apply_delta does **not** remove postgres’s ability to execute its own nested call.
4. Direct PostgREST calls as `authenticated`/`anon` **will** get `42501` — intended.

`game_finance` schema already lacks USAGE for anon/authenticated; locking the public wrapper is the client-facing control plane.

---

## Break-the-audit pass (attempts to prove P2.1 wrong)

| Hypothesis | Result |
|------------|--------|
| Forgotten browser `.rpc("fn_wallet_apply_delta")` | **Not found** in `app/`, `src/`, `services/`, `components/` |
| Admin adjust secretly uses user JWT client | **False** — `getAdminContextOrThrow` returns service client |
| Transfer API uses apply_delta under JWT | **False** — uses `fn_wallet_transfer_panel` (separate mutator) |
| Engine hot path calls `walletApplyDelta` with a user-scoped client | **False** — adapter unused; settle uses `fn_finish_room_and_settle`; admin client is service_role |
| Server Actions call apply_delta | **False** — tour actions only |
| INVOKER SQL parent requires caller EXECUTE on child | **False** — **0** INVOKER parents |
| Trigger/cron direct call | **False** |
| `fn_adjust_wallet_manual` still needs authenticated | Orphan; already **service_role-only** ACL (P2.0); nested DEFINER anyway |
| Historical migration GRANT to authenticated means product requires it | **Historical only** (`20250127144614` granted authenticated) — not evidence of a live caller |

**No contradictory evidence** requiring `authenticated` or `PUBLIC` EXECUTE for a legitimate caller was found inside this repository + live catalog.

---

## Remaining uncertainty (accepted, does not flip recommendation)

1. **Clients outside this monorepo** (another mobile binary, Postman collections, old dashboards) could still call `public.fn_wallet_apply_delta` with a user JWT today. Locking would break those **unauthorized/legacy** uses by design; none are in-repo.
2. **Manual SQL as `authenticated` role** in ad-hoc consoles would lose direct EXECUTE — operators should use service_role / DEFINER parents.
3. **Post-lock smoke** still required: admin adjust, join hold, tournament hold/release, room settle, tournament payout.

These do **not** establish a legitimate need to keep `authenticated` EXECUTE.

---

## Why service_role + postgres alone is sufficient

| Legitimate flow | Entry role | Why apply_delta still works after revoke auth/anon/PUBLIC |
|-----------------|------------|-------------------------------------------------------------|
| Admin wallet adjust | service_role | Direct RPC; keep GRANT to service_role |
| Railway settle / janitor parents | service_role → DEFINER parents | Nested as postgres |
| Player join / tournament hold | authenticated → DEFINER parents | Nested as postgres |
| Orphan adjust_manual | service_role only (already) | Nested DEFINER |
| Public wrapper → game_finance | DEFINER postgres | Schema USAGE + EXECUTE as postgres |

---

## Repository evidence index

| Path | Role |
|------|------|
| `app/api/admin/wallet/adjust/route.ts` | Only live Next direct `.rpc("fn_wallet_apply_delta")` — service_role |
| `lib/supabaseServer.ts` `getAdminContextOrThrow` | Confirms service client for adjust |
| `services/transactions.ts` | Browser → HTTP adjust API only |
| `apps/engines/bingo/src/finance/index.ts` | `walletApplyDelta` adapter (unused); `finishRoomAndSettle` used |
| `apps/engines/bingo/src/finance/settleRoom.ts` | Calls settle RPC, not apply_delta |
| `apps/engines/bingo/src/db/supabase-admin.ts` | Service role key |
| Live `pg_proc` / schema ACL | Nested parents DEFINER; `game_finance` USAGE restricted |

---

## Final status

**SAFE_TO_LOCK_WALLET_APPLY_DELTA**
