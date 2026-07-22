# DING MONEY SECURITY AUDIT — FINAL REPORT

**Platform:** Ding Money (winway)  
**Date:** 2026-07-21  
**Scope:** Consolidated adversarial review of Phases 1–5  
**Status:** Read-only audit. No production systems were tested, exploited, changed, or remediated.

**Source reports:** [Phase 1 — Architecture](./PHASE1_ARCHITECTURE_ATTACK_SURFACE_AUDIT.md) · [Phase 2 — Secrets & infrastructure](./PHASE2_SECRETS_INFRA_DEPLOYMENT.md) · [Phase 3 — Auth/RLS](./PHASE3_AUTH_RLS_AUTHORIZATION.md) · [Phase 4 — Financial](./PHASE4_WALLET_DING_FINANCIAL.md) · [Phase 5 — Engine/concurrency](./PHASE5_GAME_ENGINE_REDIS_CONCURRENCY.md)

> **Evidence boundary:** Findings are based on repository code, `schema.sql`, and migrations. Supabase production grants, RLS state, Edge configuration, and deployment variables must be checked live before declaring a finding fixed or disproven.

---

## 1. Executive summary

**Overall security risk: CRITICAL**

A normal authenticated player is not limited by the official UI. They can use the public Supabase URL/anon key, PostgREST RPC endpoints, browser DevTools, replay, and arbitrary HTTP requests. The audit found multiple database functions and table policies that appear callable outside the intended Next.js and game-engine authorization layers.

The highest-risk chain is:

```text
Valid player session (or public Supabase anon access)
  → direct PostgREST RPC
  → SECURITY DEFINER / privileged database operation
  → wallet or Ding mutation / game scheduling mutation
```

The most urgent demonstrated code/configuration risks are:

1. `public.fn_wallet_apply_delta` is a `SECURITY DEFINER` wrapper with no actor authorization and EXECUTE granted to `anon` and `authenticated`.
2. `ding_balances` permits an authenticated user to UPDATE their own row; `update_ding_balance` is also broadly granted.
3. `app_runtime_flags` and `debug_room_status_log` have no RLS in the schema snapshot while privileges are broadly granted.
4. Normal players can invoke engine-adjacent scheduling/queue RPCs if the schema grants shown in the dump are active (`fn_heartbeat_tick`, `rpc_pick_draw_jobs`).
5. Agent/super manual financial paths have insufficient hierarchy and idempotency controls.

The intended core design has meaningful strengths: DB row locks for wallet operations, server-side deterministic RNG, a PostgreSQL room lease/fencing model, conflict-safe draw finalization, and settlement guards. Those protections are undermined when direct RPC/table access bypasses the intended callers.

---

## 2. Attacker model

### Normal PLAYER

Assume a valid account and access token. The attacker can inspect client JavaScript and network traffic, call Supabase/PostgREST directly, alter JSON/query parameters, replay requests, parallelize tabs/sessions, and abandon/reconnect a session.

### AGENT

Has all player capabilities plus an agent role, intended downline visibility, and access to agent/admin-compatible panel APIs. The attacker can submit arbitrary target UUIDs and manually replay privileged requests.

### SUPER AGENT

Has all agent capabilities plus a larger hierarchy. The attacker can target direct agents and affiliated players and test APIs that treat `super` equivalently to `admin`.

### Explicit non-assumptions

- The official UI is **not** a security boundary.
- Obscure UUIDs, hidden buttons, or unlinked routes are **not** controls.
- Realtime messages and client state are display/freshness signals, not business authority.

---

## 3. Findings table

| ID | Severity | Area | Vulnerability | Exploitability | Impact | Affected component |
|----|----------|------|---------------|----------------|--------|--------------------|
| F-01 | **CRITICAL** | Financial / authz | Unchecked `SECURITY DEFINER` wallet delta callable through PostgREST | Normal player / potentially anon; one RPC request | Mint, debit, or corrupt arbitrary IRR wallet | `public.fn_wallet_apply_delta`; `game_finance.fn_wallet_apply_delta` |
| F-02 | **CRITICAL** | Ding / RLS | User can update own Ding balance; broad balance-update RPC grant | Normal player; direct table update/RPC | Infinite Ding; DING tournament abuse | `ding_balances`; `update_ding_balance` |
| F-03 | **CRITICAL** | Game state | Public/authenticated scheduling and queue RPC grants lack actor checks | Normal player; direct RPC | DoS, premature lifecycle/draw processing, game corruption | `fn_heartbeat_tick`, `rpc_pick_draw_jobs` |
| F-04 | **CRITICAL** | Operational controls | No RLS with broad table grants on runtime flags | Normal player or anon if table exposed | Lock registration globally / alter runtime flags | `app_runtime_flags` |
| F-05 | **HIGH** | Financial / agent authz | Agent-side referral transfer does not enforce target hierarchy | Agent | Drain a non-downline player to attacker wallet | `fn_adjust_referral_wallet` |
| F-06 | **HIGH** | Financial / agent authz | Service-role adjust endpoint accepts arbitrary target UUIDs without downline enforcement | Agent / super | Credit or debit unrelated accounts | `/api/admin/wallet/adjust` |
| F-07 | **HIGH** | Financial replay | Manual adjustment and transfer paths lack request idempotency | Agent / super / admin | Repeated credits/transfers by replay or concurrent tabs | wallet adjust/transfer APIs; manual RPCs |
| F-08 | **HIGH** | Game integrity / disclosure | Optional-auth results endpoint exposes `room_seed` before safe reveal | Player or unauthenticated caller with room ID | Predict future draws; unfair game advantage | `/api/player/room-results` |
| F-09 | **HIGH** | Authorization / IDOR | Three-argument cancel RPC trusts a caller-supplied `p_user` | Normal authenticated player | Cancel/refund as another player under eligible room conditions | `fn_cancel_waiting_room(..., p_user)` |
| F-10 | **HIGH** | Authorization / game data | Service-role player snapshot APIs lack demonstrated room-membership authorization | Normal player with JWT | Read other players' tickets/cards and live-room data | player live-room/gameroom APIs |
| F-11 | **HIGH** | Deployment / concurrency | Multi-replica engine can proceed without Redis locks unless strict coordination is configured | Deployment misconfiguration / failure | Overlapping scheduler/queue activity | `leaderLock.ts`, Railway env |
| F-12 | **HIGH** | Infrastructure | Production-preview isolation cannot be verified; preview with prod secrets is full compromise | Operator/deployment error | Service role / direct DB access exposed through preview | Vercel/Railway env configuration |
| F-13 | **HIGH** | Account security | Seed script has shared known password | Attacker who identifies seeded account; operator error required | Account takeover of seeded users | `scripts/seed-winway-old-list-users.cjs` |
| F-14 | **MEDIUM** | Game integrity | Whole card pool and waiting-room tickets readable | Authenticated player | Strategic/pre-game information advantage | card-pool API; `tickets_public_read_waiting` |
| F-15 | **MEDIUM** | Tournament integrity | Hold is separate from client entry upsert | Player with concurrent tabs | Double hold / entry-hold inconsistency | `TournamentRoomScreen.tsx`, tournament RPCs |
| F-16 | **MEDIUM** | Settlement availability | Finalize and settlement are separate engine steps | Worker crash / transient DB failure | Room can remain settling; delayed payouts | `processEngineDrawJob.ts`, room janitor |
| F-17 | **MEDIUM** | Information disclosure | Admin reports/finance views/debug routines broadly granted or readable | Player / anon depending on grant | Business, player, or finance recon | `fn_admin_games_report`, `vw_finance_*`, debug RPCs |
| F-18 | **MEDIUM** | Platform hardening | No CSP/security headers; engine CORS default `*` | Requires XSS/token theft for sensitive action | Enlarged client compromise blast radius | `next.config.mjs`, engine CORS |
| F-19 | **MEDIUM** | Confidentiality | PostgreSQL TLS verification disabled | Network-position attacker | DB credential/data interception risk | `lib/pg.ts` |
| F-20 | **MEDIUM** | Availability / integrity | Dual legacy/hybrid/engine draw paths can be misconfigured concurrently | Operator error | Conflicting cadence/draw attempts | runtime/engine role configuration |
| F-21 | **LOW** | Privacy / recon | Referral codes, public rooms/draws and active tournament entries are enumerable | Player / anon per policy | User/network and game timing recon | `users`, `rooms`, `draws`, tournament policies |
| F-22 | **LOW** | Observability | Sensitive financial metadata/errors logged; DB errors returned to client | Log-reader / ordinary caller | Operational information leakage | wallet adjust route, API errors |

---

## 4. Top attack paths

### Path A — Normal player creates money

1. Log in normally, obtain the access token from browser traffic/session.
2. Send a direct request to Supabase PostgREST RPC `public.fn_wallet_apply_delta`.
3. Supply the attacker UUID, desired currency, positive delta, and accepted transaction enum values.
4. The public wrapper delegates to `game_finance.fn_wallet_apply_delta`, which locks/updates the wallet and writes a transaction but does not validate the caller.

**Outcome:** Arbitrary wallet credit. The ledger makes the fraudulent change look like a completed transaction rather than preventing it.

### Path B — Normal player inflates Ding

1. Use Supabase directly rather than the UI.
2. Update the authenticated user's `ding_balances.balance`, or call `update_ding_balance` with a positive amount if the live policy/grant matches the dump.
3. Use the inflated Ding for DING-denominated tournament entry or other Ding value.

**Outcome:** Artificial Ding creation and possible conversion into game value/prizes.

### Path C — Normal player interferes with game operations

1. Call exposed `fn_heartbeat_tick` or `rpc_pick_draw_jobs`.
2. Cause scheduler/queue state changes outside the engine's intended worker flow.
3. Repeated requests amplify load; jobs can be claimed/requeued and lifecycle actions invoked.

**Outcome:** Denial of service and game-state disruption. This is not equivalent to a player choosing a ball number, but it can compromise availability and the trusted draw pipeline.

### Path D — Normal player predicts draws or sees opponent information

1. Query `room-results` with a guessed/observed room UUID to obtain `room_seed`.
2. Reproduce the deterministic SHA-256 ordering from client-visible code.
3. Predict remaining draw order, combining it with card-pool/waiting-ticket leakage where available.

**Outcome:** Material competitive advantage without modifying game state.

### Path E — Agent drains a non-downline account

1. Authenticate as an agent.
2. Directly invoke `fn_adjust_referral_wallet` with an unrelated player UUID, `withdraw`, and a positive amount.
3. The function checks that the actor is agent/super/admin but does not establish that target belongs to the actor's permitted hierarchy.

**Outcome:** Transfer value from a victim to the agent wallet.

### Path F — Agent replays a manual credit

1. Submit a valid `/api/admin/wallet/adjust` request.
2. Replay it from DevTools, an HTTP client, or simultaneous browser tabs.
3. Each request invokes a new service-role financial delta with no request idempotency key.

**Outcome:** Repeated manual credit/debit operations.

---

## 5. CRITICAL vulnerabilities requiring immediate remediation — P0

| Finding | Why P0 | Required verification before closure |
|---------|--------|--------------------------------------|
| F-01: unrestricted wallet delta | Direct monetary loss / unlimited minting | Live EXECUTE grants, wrapper/function body, and negative/positive transaction behavior |
| F-02: Ding write access | Direct value creation by every player | Live RLS policies, table privileges, RPC EXECUTE grants |
| F-03: unauthenticated/unchecked engine RPCs | Core game control and DoS path | Live grants for every overload/schema and whether PostgREST exposes them |
| F-04: runtime flag table without RLS | Global business-control tampering | Live `relrowsecurity`, grants, and PostgREST exposure |

**P0 containment goal:** A normal player must have no direct route—table write, RPC, Next API, engine API, or Realtime side effect—to mutate any balance, Ding, runtime flag, draw job, room state, result, or settlement except through a purpose-specific operation that binds actor identity in the database.

---

## 6. HIGH vulnerabilities — P1

1. Enforce hierarchy in all agent/super financial operations (F-05, F-06).
2. Bind cancellation actor to `auth.uid()` and eliminate or restrict arbitrary-user overloads (F-09).
3. Require room membership / narrowly scoped visibility in service-role snapshot APIs (F-10).
4. Prevent seed exposure until the correct reveal phase (F-08).
5. Add idempotency to manual adjustment and transfer operations (F-07).
6. Ensure Redis/lease coordination fails closed for multiple replicas and production role configuration is exclusive (F-11, F-20).
7. Verify preview uses isolated non-production credentials; remove/rerotate known seeded accounts if script was ever run (F-12, F-13).

---

## 7. MEDIUM vulnerabilities — P2

1. Make tournament hold + entry persistence a single server-side/database transaction, or prove a durable hold-to-entry state machine (F-15).
2. Improve settlement recovery monitoring: alert on `settling` age, failed finalization, and janitor repair (F-16).
3. Restrict card pool, waiting-ticket, admin-report, finance-view, and debug read surfaces (F-14, F-17).
4. Add security headers/CSP, restrict engine CORS, and enable certificate verification for direct PostgreSQL (F-18, F-19).
5. Gate test/debug routes from production builds; reduce error disclosures and sensitive logs (F-17, F-22).

---

## 8. LOW findings / P3 hardening

1. Reduce public metadata and referral/tournament enumeration (F-21).
2. Enforce consistent API error contracts without raw database messages.
3. Remove committed temporary artifacts; add history secret scanning and CI checks.
4. Add rate limits, per-user join limits, request-size limits, and anomaly alerts for direct RPC/API calls.
5. Document a production configuration matrix: runtime mode, active roles, replica count, Redis requirement, CORS origins, preview secrets.

---

## 9. Financial integrity assessment

### Assessment: **CRITICAL risk**

**Strengths**

- The core wallet operation locks wallet rows with `FOR UPDATE`.
- It rejects zero deltas and prevents negative balances unless explicitly allowed.
- It writes `balance_before` / `balance_after` transaction records.
- Two-sided panel transfer locks both wallets deterministically.
- Room settlement is a PostgreSQL transaction with a finished-room guard.

**Breaks in the security boundary**

- The core primitive is directly exposed through a broadly granted wrapper without caller authorization.
- Ding permits direct balance mutation under the reported RLS/grant model.
- Agent/super adjustments rely on application routing or insufficient role checks rather than enforced target hierarchy.
- Manual adjustments/transfers lack idempotency; replay and parallel requests are business-valid duplicates.
- Legacy balance writers create audit consistency/reconciliation risk.

**Conclusion:** Financial atomicity is reasonable within correctly authorized calls. Financial authorization is not. Atomic code cannot protect money when arbitrary callers can invoke the atomic primitive.

---

## 10. Game integrity assessment

### Assessment: **HIGH risk**

**Strengths**

- RNG is deterministic, server-side, seed-committed, and reproducible.
- The room actor uses a PostgreSQL lease with epoch fencing.
- Draw insertion is owner/status/due-time guarded.
- Mark/result inserts are conflict safe; Ding aggregation has unique constraints.
- Settlement is server-driven rather than browser-driven.

**Risks**

- Seed disclosure enables draw prediction.
- Engine scheduler/queue RPC grants can permit direct interference.
- Game has three runtime modes and multiple worker paths; deployment misconfiguration can cause competing drivers.
- Redis lock degradation is permissive in single-instance mode; a wrong replica/strictness setting makes that unsafe.
- Post-finalize settlement failure can leave a room in recovery state.

**Conclusion:** The intended engine is substantially server-authoritative, but the public database control plane and deployment coordination create material integrity/availability risk.

---

## 11. Authentication and authorization assessment

### Assessment: **CRITICAL risk**

**Strengths**

- Bearer JWT validation is present on most player/admin API routes.
- Browser role metadata is not the authoritative server role source.
- `users.role` cannot be changed by normal player RLS update policy.
- The safer transfer route uses a user-scoped RPC so `auth.uid()` is meaningful in the database.

**Failures**

- Direct PostgREST RPC permissions form a second public API surface with insufficient checks.
- Service-role APIs often authenticate a JWT then depend on route code for all authorization.
- Agent/super/admin role gates are inconsistent across route and database layers.
- Broad `USING (true)` / public-read policies expose more game data than player membership should permit.
- No-RLS operational tables have broad grants in the schema snapshot.

**Conclusion:** Authentication is generally present. Authorization is inconsistent and must be treated as compromised until direct function/table privileges are brought under a deny-by-default model.

---

## 12. Infrastructure and secrets assessment

### Assessment: **MODERATE risk** (with potential CRITICAL deployment failure)

**Positive evidence**

- No tracked service-role key, database password, Redis token, or JWT was found in the repository scan.
- Real environment files are ignored.
- Secret-bearing server modules were not found in client import paths.
- Redis credentials are confined to engine configuration.

**Risks**

- Preview/prod environment separation cannot be verified from code; a preview carrying production service-role/database credentials would be critical.
- Engine CORS falls back to `*`.
- No repository-defined CSP or security header baseline.
- Direct PostgreSQL TLS verification disables CA validation.
- A committed seed script contains a shared known password and user roster.
- No checked-in CI workflow demonstrates secret scanning or deployment policy enforcement.

---

## 13. Recommended remediation order

| Priority | Objective | Representative work (do not implement from this report alone) |
|----------|-----------|---------------------------------------------------------------|
| **P0** | Remove public financial/game mutation capability | Revoke broad EXECUTE/table grants; restrict to service role; make every remaining RPC bind and authorize actor; fix Ding write policies; protect runtime flags |
| **P1** | Constrain privileged operations and sensitive reads | DB-enforced hierarchy for agent/super; room membership checks; seed reveal policy; cancellation binding; idempotency keys |
| **P2** | Make recovery, deployment, and audit robust | Transactional tournament registration; settlement monitoring; production Redis/role validation; isolated preview environments; CORS/TLS/CSP |
| **P3** | Reduce attack surface and improve detection | Remove test/debug endpoints; reduce public metadata; sanitize logs/errors; rate limiting; CI secret/RLS/grant checks |

### Proposed remediation plan (not implemented)

**P0 — before production/public traffic**

1. Inventory live database EXECUTE/table grants using a privileged, read-only catalog query.
2. Make PostgREST default-deny for all finance, engine, admin, debug, and operational functions/tables.
3. Permit service-only functions only to `service_role`; expose player RPCs only with explicit `auth.uid()` and `WITH CHECK` protections.
4. Remove player write access to Ding balance rows and route Ding credits exclusively through service-owned idempotent draw finalization.
5. Put `app_runtime_flags` and debug data under RLS/least privilege.
6. Rotate/reconcile balances and audit transactions after confirming whether F-01/F-02 were ever reachable in production.

**P1 — urgent**

1. Replace manual adjustment flows with a single database-authorized transfer/adjustment model that includes actor, target scope, immutable idempotency key, audit event, and transaction boundary.
2. Enforce hierarchy in the **database**, not just route logic.
3. Require participant membership for cards/tickets/results and prevent room seed disclosure prior to completion/reveal.
4. Eliminate arbitrary-user cancellation parameters for browser-callable functions.
5. Enforce production multi-replica fail-closed coordination; validate one runtime owner for every draw lifecycle operation.

**P2 — should fix**

1. Collapse tournament hold and entry commit into one authoritative transaction.
2. Add automated reconciliation: wallet balance ↔ transaction ledger, Ding balance ↔ Ding ledger, room settlement state ↔ results/payouts.
3. Alert on stalled settlement, stale queue jobs, lease fencing rejects, lock degradation, unexpected direct RPC calls, and high-rate joins.
4. Isolate preview/develop service credentials and deny scheduler/game-engine production roles outside production.
5. Restrict CORS; add CSP, HSTS, framing policy, permissions policy, and proper database TLS verification.

**P3 — hardening**

1. Remove production test/debug routes and unused RPCs.
2. Add rate limiting and fraud controls around joins, financial actions, and snapshot endpoints.
3. Adopt CI checks for SQL grants/RLS diffs, migration review, secret scanning, and production config validation.
4. Maintain a permanent authorization matrix and test it with negative integration tests for player, agent, super, admin, and service roles.

---

## 14. Final conclusion

The system contains a sound foundation for authoritative gameplay and atomic accounting, but currently exposes enough direct database and service-role-adjacent capability that a malicious normal player may be able to create value, alter Ding, disrupt game processing, or obtain unfair information without defeating authentication.

**Do not open the system to public traffic until P0 items are independently verified and remediated against the live Supabase project and deployed engine configuration.**

*End of final report.*
