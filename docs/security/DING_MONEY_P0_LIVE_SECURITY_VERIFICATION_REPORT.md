# DING MONEY — P0 LIVE SECURITY VERIFICATION REPORT

**Date:** 2026-07-21  
**Mode:** Read-only live catalog verification  
**No state-changing actions performed:** No RPC mutation calls, updates, inserts, deletes, migrations, grants, RLS changes, lifecycle actions, wallet/Ding changes, draw-job claims, heartbeats, cancellations, settlements, or runtime-flag changes.

**Related reports:** [Final audit](./DING_MONEY_SECURITY_AUDIT_FINAL_REPORT.md) · [Phase 3](./PHASE3_AUTH_RLS_AUTHORIZATION.md) · [Phase 4](./PHASE4_WALLET_DING_FINANCIAL.md) · [Phase 5](./PHASE5_GAME_ENGINE_REDIS_CONCURRENCY.md)

> **Classification rule:** “Live” means confirmed from the deployed PostgreSQL catalog and function definitions, using read-only `SELECT` queries through the Supabase MCP `execute_sql` mechanism. The connected project is the deployed default `main` project, but its product/business label as *production* cannot be proven from catalog metadata; it is therefore **deployed main, production status unverified**.

---

## 1. Environment inspected

| Item | Result |
|------|--------|
| Connected project ref | `gtwgatewbagklpmxdlsj` |
| Project URL identity | `https://gtwgatewbagklpmxdlsj.supabase.co` |
| Branch | Default branch: `main` |
| Other branch observed | `v02` (`ucpbrfghhssmqfizkphl`) — **not inspected** |
| Connection mechanism | Supabase MCP → PostgreSQL `execute_sql` |
| Environment label | **Deployed main; production status unverified** |
| Credentials/tokens exposed | None |
| Mutating verification attempted | None |

`current_setting('pgrst.db_schemas', true)` and `current_setting('pgrst.db_anon_role', true)` returned `NULL` from this database session. Therefore the exact PostgREST exposed-schema configuration was **not available from the database catalog session**. `public` is the standard Supabase API schema, but Data API exposure is marked separately where it cannot be proven from this session alone.

---

## 2. Executive summary

Three of four P0 repository findings are **confirmed live at the deployed database authorization layer**:

1. **P0-01 — CONFIRMED CRITICAL:** `public.fn_wallet_apply_delta` and `game_finance.fn_wallet_apply_delta` are `SECURITY DEFINER`, executable by `PUBLIC`/`anon`/`authenticated`, accept arbitrary `p_user_id`, caller-controlled positive/negative delta and `p_allow_negative`, and contain no caller authorization.
2. **P0-02 — CONFIRMED CRITICAL:** `ding_balances` grants authenticated users full UPDATE column privileges and has an UPDATE policy of only `auth.uid() = user_id`; it has no restrictive `WITH CHECK`. `public.update_ding_balance` is publicly executable and adds caller-controlled amount. More severely, public `rpc_apply_ding_credits_for_draw` and `rpc_finalize_engine_draw_job` are `SECURITY DEFINER`, publicly executable, and do not authorize the caller.
3. **P0-03 — CONFIRMED CRITICAL:** `public.fn_heartbeat_tick` and `public.rpc_pick_draw_jobs` are publicly executable without caller checks and mutate lifecycle/queue state. `game_core.rpc_pick_draw_jobs` has matching permissive EXECUTE rights.
4. **P0-04 — LIVE CONFIG DIFFERENT / CONFIRMED SAFE for direct client DML:** `public.app_runtime_flags` has RLS enabled live and no policies. Although table and column grants are excessively broad, an `anon`/`authenticated` Data API caller has no RLS policy permitting row access or mutation.

Additionally, multiple alternate P0-equivalent functions are live and broadly executable, including direct Ding-credit and engine-finalize functions. See §8.

---

## 3. P0 verification matrix

| ID | Object | Repository finding | Live status | Severity | Evidence | Exploitability | Remediation required? |
|----|--------|--------------------|-------------|----------|----------|----------------|-----------------------|
| P0-01 | `public.fn_wallet_apply_delta` | Unchecked DEFINER wrapper/grant | **CONFIRMED CRITICAL** | Critical | `SECURITY DEFINER`; `=X`, anon/authenticated EXECUTE; wrapper forwards all arguments; no auth checks | DB authorization permits arbitrary target + delta | Yes — P0 |
| P0-01 | `game_finance.fn_wallet_apply_delta` | Unchecked core primitive/grant | **CONFIRMED CRITICAL** | Critical | `SECURITY DEFINER`; PUBLIC effective EXECUTE; no auth checks; updates `wallets`/`transactions` | Direct schema API exposure unverified; public wrapper is sufficient | Yes — P0 |
| P0-02 | `public.ding_balances` | Player can update own balance | **CONFIRMED CRITICAL** | Critical | RLS UPDATE `USING (auth.uid() = user_id)`; no `WITH CHECK`; authenticated has UPDATE on sensitive columns | Player may set own `balance`/`locked_amount` on own row | Yes — P0 |
| P0-02 | `public.update_ding_balance` | Broad RPC can add arbitrary amount | **CONFIRMED CRITICAL** | Critical | PUBLIC/anon/authenticated EXECUTE; invoker function adds `p_amount`; no auth check in body | Own existing row is reachable through RLS; no test executed | Yes — P0 |
| P0-03 | `public.fn_heartbeat_tick` | Public lifecycle control RPC | **CONFIRMED CRITICAL** | Critical | PUBLIC/anon/authenticated EXECUTE; calls `game_core.fn_manage_waiting_rooms` and `fn_manage_room_live_actions`; no caller guard | Lifecycle/draw side effects if public API schema is exposed | Yes — P0 |
| P0-03 | `public.rpc_pick_draw_jobs` | Public queue-claim RPC | **CONFIRMED CRITICAL** | Critical | `SECURITY DEFINER`, PUBLIC/anon/authenticated EXECUTE; changes queued jobs to `processing` | Queue-state mutation; no caller guard | Yes — P0 |
| P0-03 | `game_core.rpc_pick_draw_jobs` (two overloads) | Public queue-claim overloads | **CONFIRMED HIGH** | High | Both executable by PUBLIC/anon/authenticated; definitions update job status/attempts | API exposure of `game_core` schema unverified; public wrapper already critical | Yes — P0 |
| P0-04 | `public.app_runtime_flags` | No RLS + broad grants | **LIVE CONFIG DIFFERENT — CONFIRMED SAFE for direct client DML** | N/A for direct Data API write | RLS enabled; no SELECT/INSERT/UPDATE/DELETE policy exists | RLS denies client row access/mutation despite grants | Yes — P1 cleanup of grants/force RLS |

---

## 4. P0-01 — Wallet RPC detailed verification

### Live function inventory

| Schema | Function / signature | Return | Security | Owner | PUBLIC / anon / authenticated / service_role EXECUTE |
|--------|----------------------|--------|----------|-------|------------------------------------------------------|
| `public` | `fn_wallet_apply_delta(uuid, text, numeric, transaction_type, text, text, text, jsonb, boolean)` | `uuid` | **SECURITY DEFINER** | `postgres` | **Yes / Yes / Yes / Yes** |
| `game_finance` | same signature | `uuid` | **SECURITY DEFINER** | `postgres` | **Yes / Yes / Yes / Yes** |

### Live definition evidence

`public.fn_wallet_apply_delta` is a SQL `SECURITY DEFINER` wrapper:

```text
SELECT game_finance.fn_wallet_apply_delta(
  p_user_id, p_currency, p_amount_delta, p_transaction_type,
  p_source_kind, p_source_ref, p_description, p_meta, p_allow_negative
);
```

It does not check `auth.uid()`, `auth.role()`, caller role, target ownership, hierarchy, or service role.

`game_finance.fn_wallet_apply_delta`:

- locks or creates the wallet for **caller-supplied `p_user_id`**;
- calculates `balance_after = balance_before + p_amount_delta`;
- accepts **positive and negative** `p_amount_delta`;
- accepts caller-controlled `p_allow_negative`;
- writes `wallets.balance` and a completed `transactions` row;
- contains no actor/caller authorization check.

### Classification

**CONFIRMED CRITICAL at the live database authorization layer.**

The public-schema wrapper has PUBLIC/anon/authenticated EXECUTE and directly calls the privileged core. Exact PostgREST `db_schemas` configuration was unavailable, so Data API exposure itself is technically **unverified from this session**, but the live grant/function configuration is sufficient to treat the defect as P0.

---

## 5. P0-02 — Ding detailed verification

### `public.ding_balances`: live RLS and privileges

| Control | Live result |
|---------|-------------|
| Table exists | Yes |
| Owner | `postgres` |
| RLS enabled | **Yes** |
| FORCE RLS | No |
| anon/authenticated table privileges | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER all granted |
| authenticated UPDATE columns | `user_id`, `balance`, `locked_amount`, timestamps — all have UPDATE privilege |
| UPDATE policy | `USING (auth.uid() = user_id)` for `{public}` |
| UPDATE `WITH CHECK` | Not explicit; PostgreSQL uses the applicable row condition for UPDATE policy checks |
| INSERT/DELETE policy | None |

The live policy controls only **which row** can be targeted. It does not constrain **which fields** an owner may change. Therefore an authenticated player may directly set `balance` and `locked_amount` on their own Ding row through a role operating under the Data API, subject to the API schema being exposed.

### `public.update_ding_balance`: live function verification

| Property | Live result |
|----------|-------------|
| Signature | `update_ding_balance(p_user_id uuid, p_amount numeric) → numeric` |
| Security mode | SECURITY INVOKER |
| Owner | `postgres` |
| Execute | PUBLIC / anon / authenticated / service_role: **Yes** |
| Caller check | None in function definition |
| Mutation | Upserts a row; on conflict: `balance = ding_balances.balance + p_amount` |
| Target | `p_user_id` is caller-controlled |
| Amount | `p_amount` is caller-controlled; no positivity/bounds validation |

For another user, this invoker function is constrained by the live `ding_balances` RLS policy. For the caller's own **existing** row, the RLS UPDATE condition matches and the function can add a positive amount.

### P0-equivalent Ding RPCs discovered live

| Function | Live risk |
|----------|-----------|
| `public.rpc_apply_ding_credits_for_draw(...)` | **SECURITY DEFINER**, PUBLIC/anon/authenticated executable, no actor check. Accepts arbitrary JSON credit entries (`user_id`, positive `amount`) and credits `ding_balances` after a state-gated draw lookup. |
| `public.rpc_finalize_engine_draw_job(...)` | **SECURITY DEFINER**, PUBLIC/anon/authenticated executable, no actor check. Lease fencing is optional because both `p_owner_id` and `p_lease_epoch` may be NULL; it accepts marks/results/credits JSON and calls `rpc_apply_ding_credits_for_draw`. |

### Classification

**CONFIRMED CRITICAL.** An ordinary player can directly modify their own authoritative Ding fields under live RLS/table permissions. The publicly executable Ding-credit/finalize functions are additional critical engine/Ding mutation paths.

---

## 6. P0-03 — Engine RPC detailed verification

### `public.fn_heartbeat_tick()`

| Property | Live result |
|----------|-------------|
| Security mode | SECURITY INVOKER |
| Execute | PUBLIC / anon / authenticated / service_role: **Yes** |
| Auth guard | None |
| State-changing callees | `game_core.fn_manage_waiting_rooms(50, false)` and `game_core.fn_manage_room_live_actions()` |

**Classification:** **CONFIRMED CRITICAL.** Its function body invokes room lifecycle and live game actions. It is publicly executable with no caller authorization.

### `public.rpc_pick_draw_jobs(p_limit integer)`

| Property | Live result |
|----------|-------------|
| Security mode | **SECURITY DEFINER** |
| Execute | PUBLIC / anon / authenticated / service_role: **Yes** |
| Auth guard | None |
| Mutation | Selects queued jobs with `FOR UPDATE ... SKIP LOCKED`, then changes rows to `status = 'processing'` |
| User-controlled parameter | `p_limit` (bounded only to minimum 1; no demonstrated maximum) |

**Classification:** **CONFIRMED CRITICAL.** It changes the authoritative draw-job queue without validating the caller.

### `game_core.rpc_pick_draw_jobs` overloads

| Signature | Security | Execute | Mutation |
|-----------|----------|---------|----------|
| `(p_limit integer)` | INVOKER | PUBLIC/anon/authenticated/service_role | Claims queued rows, changes status to `processing`, increments attempts |
| `(p_limit integer, p_worker_id integer, p_total_workers integer)` | INVOKER | PUBLIC effective grant (including anon/authenticated) | Same class of queue mutation |

`game_core` API-schema exposure was not available from the session. The public wrapper above already creates a confirmed critical path.

---

## 7. P0-04 — Runtime flags detailed verification

### Live table configuration: `public.app_runtime_flags`

| Control | Live result |
|---------|-------------|
| Table exists | Yes |
| Sensitive fields | `global_registration_locked`, `global_registration_lock_reason`, `global_registration_locked_by`, `global_registration_locked_at` |
| Owner | `postgres` |
| RLS enabled | **Yes** |
| FORCE RLS | No |
| RLS policies | **None** |
| anon/authenticated grants | Broad table/column grants, including SELECT/INSERT/UPDATE/DELETE/TRUNCATE |

### Classification

**LIVE CONFIG DIFFERENT from repository snapshot.** The repository report described no RLS; the deployed main project has RLS enabled. Because no RLS policy permits SELECT/INSERT/UPDATE/DELETE, normal `anon`/`authenticated` roles are denied row-level Data API access despite broad grants.

**CONFIRMED SAFE for direct normal-client row mutation, based on live RLS policy.**

The broad grants and lack of FORCE RLS remain a least-privilege defect. They should be corrected, but catalog evidence does not support a P0 claim that a normal Supabase client can currently change the flags directly.

---

## 8. Alternate P0-equivalent mutation paths

The following were discovered through live function catalog/definition review. They are included because fixing only the four original names would leave comparable capability.

| Object | Live evidence | Status |
|--------|---------------|--------|
| `game_finance.fn_wallet_add(...)` | SECURITY DEFINER; PUBLIC/anon/authenticated EXECUTE; arbitrary `p_user`, `p_amount`; directly increments `wallets.balance`; no auth guard | **CONFIRMED CRITICAL DB grant defect**; non-public-schema API exposure unverified |
| `public.fn_finish_room_and_settle(...)` | SECURITY DEFINER wrapper, PUBLIC/anon/authenticated EXECUTE; no caller guard | **CONFIRMED CRITICAL DB grant defect**; can invoke settlement when room state allows |
| `game_finance.fn_finish_room_and_settle(...)` | SECURITY DEFINER; PUBLIC effective EXECUTE; no caller guard | **CONFIRMED CRITICAL DB grant defect**; schema API exposure unverified |
| `public.rpc_apply_ding_credits_for_draw(...)` | SECURITY DEFINER, PUBLIC/anon/authenticated EXECUTE; arbitrary credits JSON; no actor guard | **CONFIRMED CRITICAL** |
| `public.rpc_finalize_engine_draw_job(...)` | SECURITY DEFINER, PUBLIC/anon/authenticated EXECUTE; arbitrary marks/results/credits; optional lease fence | **CONFIRMED CRITICAL** |
| `public.fn_process_draw_jobs_batch*` | PUBLIC/anon/authenticated EXECUTE; no auth checks detected; draw job related | **CONFIRMED HIGH**; exact side effects require function-level remediation review |
| `game_core.fn_manage_room_live_actions()` / `fn_manage_waiting_rooms(...)` | Broad effective EXECUTE; no caller checks detected; lifecycle functions | **CONFIRMED HIGH**; schema API exposure unverified |
| `public.fn_adjust_referral_wallet(...)` | DEFINER; actor role check exists but no hierarchy check; allows agent/super/admin target operation | **CONFIRMED HIGH** for privileged actors |
| `public.fn_adjust_wallet_manual(...)` | DEFINER; actor role check exists but no hierarchy check | **CONFIRMED HIGH** for privileged actors |

No mutation RPC was invoked to test a particular game row or financial value.

---

## 9. Repository vs live drift

| Object | Repository audit result | Live result | Match? | Security status |
|--------|-------------------------|-------------|--------|-----------------|
| `public.fn_wallet_apply_delta` | Public grant + no caller authorization | Same | Yes | **CONFIRMED CRITICAL** |
| `game_finance.fn_wallet_apply_delta` | Authenticated grant/no caller authorization | PUBLIC effective grant + no caller authorization | Worse live/default grant posture | **CONFIRMED CRITICAL** |
| `ding_balances` | RLS own UPDATE and broad grant | Same material policy/grant posture | Yes | **CONFIRMED CRITICAL** |
| `update_ding_balance` | Broad execute + arbitrary addition | Same | Yes | **CONFIRMED CRITICAL** |
| `fn_heartbeat_tick` | Broad execute/no caller guard | Same | Yes | **CONFIRMED CRITICAL** |
| `rpc_pick_draw_jobs` | Broad execute/no caller guard | Same, including public DEFINER wrapper | Yes | **CONFIRMED CRITICAL** |
| `app_runtime_flags` | No RLS + broad grants | RLS enabled, no policies, broad grants | **No — repository stale** | **CONFIRMED SAFE for direct DML** |

---

## 10. Normal-player capability matrix

Answers below are based only on live catalog/function authorization evidence. “Yes” means the database authorization accepts the class of call; no mutation request was sent.

| Capability | Result | Why |
|------------|--------|-----|
| A. Increase an IRR wallet balance | **YES — confirmed by live authorization configuration** | `public.fn_wallet_apply_delta` is public/DEFINER, accepts arbitrary positive delta and user ID, no caller check |
| B. Decrease another user’s IRR wallet | **YES — confirmed by live authorization configuration** | Same function accepts arbitrary target and negative delta; caller controls `p_allow_negative` |
| C. Increase own Ding balance | **YES — confirmed by live authorization configuration** | Own-row UPDATE policy + broad column UPDATE; `update_ding_balance` adds caller-controlled amount |
| D. Change another user’s Ding balance | **YES — confirmed conditional engine path** | `rpc_apply_ding_credits_for_draw` is public/DEFINER, accepts arbitrary credited user ID; requires an eligible processed/unaggregated draw. Current eligible draw state was not queried or altered. |
| E. Claim/interfere with draw jobs | **YES — confirmed by live authorization configuration** | `public.rpc_pick_draw_jobs` changes queued jobs to `processing` with no caller guard |
| F. Invoke heartbeat/game lifecycle operations | **YES — confirmed by live authorization configuration** | `public.fn_heartbeat_tick` is publicly executable and calls state-changing lifecycle functions |
| G. Change global registration/runtime flags | **NO — confirmed blocked by live RLS configuration** | `app_runtime_flags` has RLS enabled and no client policy; grants alone do not bypass RLS for Data API DML |

**PostgREST caveat:** Exact API-schema exposure was unavailable from session settings. The matrix confirms database authorization and applies directly if `public` is exposed through the Supabase Data API, as is standard for this project type.

---

## 11. Exact P0 remediation targets (not implemented)

### Financial and Ding

1. Revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated` for:
   - `public.fn_wallet_apply_delta(...)`
   - `game_finance.fn_wallet_apply_delta(...)`
   - `game_finance.fn_wallet_add(...)`
   - `public.update_ding_balance(...)`
   - `public.rpc_apply_ding_credits_for_draw(...)`
   - `public.rpc_finalize_engine_draw_job(...)`
   - public/engine settlement and capture wrappers not intended for user calls.
2. Restrict financial/game mutation primitives to `service_role` (or a narrowly scoped database role) only.
3. Remove direct authenticated UPDATE privilege on `ding_balances.balance`, `ding_balances.locked_amount`, and sensitive identity/timestamp columns.
4. Replace the permissive Ding UPDATE policy with a read-only player policy; no browser client should directly write authoritative Ding value.
5. Make every browser-callable financial function bind target identity to `auth.uid()` or enforce a database hierarchy/authorization check.
6. Prevent caller control of unbounded `p_amount_delta`, arbitrary `p_user_id`, and `p_allow_negative` in exposed interfaces.

### Engine and lifecycle

1. Revoke `PUBLIC`, `anon`, and `authenticated` EXECUTE from:
   - `public.fn_heartbeat_tick()`
   - `public.rpc_pick_draw_jobs(integer)`
   - `game_core.rpc_pick_draw_jobs` overloads
   - `public.fn_process_draw_jobs_batch*`
   - lifecycle/settlement/finalize functions not intended for players.
2. Restrict engine RPCs to service role/internal engine role.
3. Require a non-optional verified lease/worker fence in engine finalization; do not permit a caller to omit both fence inputs.
4. Consolidate public wrappers and remove obsolete/deprecated wrappers that preserve equivalent mutation paths.

### Runtime flags

1. Retain live RLS on `app_runtime_flags`; consider FORCE RLS.
2. Revoke broad anon/authenticated table and column grants, including TRUNCATE/REFERENCES/TRIGGER.
3. Keep direct client policies absent; expose runtime changes only through explicitly authorized server code.

---

## 12. Recommended remediation order

| Priority | Action | Reason |
|----------|--------|--------|
| **P0.1** | Lock down all live wallet/Ding/engine RPC EXECUTE grants and exposed schemas | Stops direct money and game-control mutation |
| **P0.2** | Remove client mutation rights from `ding_balances` | Stops ordinary-player Ding inflation |
| **P0.3** | Restrict `fn_wallet_apply_delta` and all wrappers to internal service callers | Stops arbitrary IRR credit/debit |
| **P0.4** | Restrict finalization, Ding aggregation, heartbeat, queue, and settlement functions | Stops engine control/state corruption |
| **P0.5** | Audit/reconcile prior financial and Ding events after fixing exposure | Determines whether live abuse occurred |
| **P1** | Enforce DB-level hierarchy + idempotency for agent/super manual operations | Prevents privileged unauthorized transfer/replay |
| **P1** | Harden runtime flags grants and force-RLS decision | Removes dormant privilege risk |
| **P2** | Verify PostgREST exposed schemas, production environment identity, preview isolation, and engine worker role config | Closes deployment/config ambiguity |
| **P3** | Add automated grant/RLS regression checks and security monitoring | Prevents recurrence |

---

## Final conclusion

The live deployed `main` database is **not merely affected by repository-only findings**. The P0 wallet, Ding, and engine-control authorization defects are confirmed by live catalog grants, RLS policies, and deployed function definitions.

`app_runtime_flags` is the exception: the live database has RLS enabled and no permissive policies, so the repository’s direct-write finding is stale for normal client DML.

No exploitation was performed. Immediate remediation should start with revoking normal-client access to financial, Ding, engine, lifecycle, queue, finalization, and settlement mutation primitives.

*End of P0 live verification report.*
