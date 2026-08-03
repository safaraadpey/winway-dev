# P6.3 — Transfer Atomicity Audit

> **READ ONLY** · Internal Treasury Transfer path  
> Primary SoR function: `public.fn_wallet_transfer_panel`  
> API: `POST /api/admin/wallet/transfer`

---

## 1. Intended semantics

```
Sender.balance  -= amount
Receiver.balance += amount
SenderΔ + ReceiverΔ = 0
```

Cash-out to the physical world is **out of band**; digital burn uses adjust `withdraw`, not transfer.

---

## 2. Atomicity — PASS (single transfer)

Evidence: `sql/migrations/20260212171000_allow_agent_wallet_transfer_to_direct_agents.sql` (and predecessors).

| Step | Behavior |
|------|----------|
| Auth | `v_actor := auth.uid()` — no client actor id |
| Locks | Both wallets `SELECT … ORDER BY id FOR UPDATE` |
| Updates | Both balances in same function |
| Ledger | `transfer_out` + `transfer_in`, shared `transfer_id` / `source_ref` |
| Commit | One PL/pgSQL invocation = one DB transaction |
| Partial success inside pair | **Not possible** — exception rolls back both |

**Invariant B: HELD** for this function.

---

## 3. Idempotency — FAIL

| Observation | Impact |
|-------------|--------|
| `v_transfer_id := gen_random_uuid()` every call | New logical transfer each request |
| No `idempotency_key` / client request id | Replay POST = second transfer |
| API bulk loop | N targets = N independent transfers |

**Classification: CRITICAL** for high-value / automated clients (P6.1 R02).

---

## 4. Hierarchy — PASS (DB-side)

| Role | Rule (SQL) |
|------|------------|
| `admin` | Allowed broadly |
| `super` | Agents with `parent_id = actor`; players via affiliation / parent |
| `agent` | Players in tree; **direct child agents** (per later migration) |
| others | `FORBIDDEN` |

API uses **user JWT** so `auth.uid()` matches actor — correct pattern (stronger than adjust’s service_role).

---

## 5. Race — PASS (pair)

Ordered `FOR UPDATE` prevents deadlock deadlock AB/BA classic failure and serializes concurrent transfers touching same wallets.

---

## 6. Dual-write vs apply_delta — MEDIUM/HIGH design debt

Transfer **does not** call `fn_wallet_apply_delta`.

| Pro | Con |
|-----|-----|
| Atomic pair in one function | Two writers to `wallets` in codebase |
| Explicit transfer types | Ledger projection tools must include transfer types |
| | Harder “single primitive” proofs |

**Remediation preference:** implement transfer as two apply_delta calls **in one SQL function TX** with shared idempotency/transfer_id — or keep dual-write but document as second SoR writer.

---

## 7. API bulk partial failure — HIGH

`transfer/route.ts` loops targets; early successes persist if later fail → HTTP error with partial money moved.

Same pattern on `adjust`.

---

## 8. Path coverage (hierarchy edges)

| Edge | Via transfer panel? |
|------|---------------------|
| Admin → Super | Allowed if roles permitted by function |
| Admin → Agent / Player | Yes |
| Super → Agent | Yes (tree) |
| Super → Player | Yes (tree) |
| Agent → Player | Yes (tree) |
| Agent → child Agent | Yes (direct) |
| Player → Agent | Only if action direction supports reverse (`p_action`) — verify action semantics in API (`deposit`/`withdraw` relative to actor) |
| Outside tree | **Blocked in SQL** |

Directional `p_action` selects who is from/to relative to actor vs target — still zero-sum.

---

## 9. Finding summary

| ID | Finding | Severity |
|----|---------|----------|
| T1 | Pair transfer atomic + locked | — PASS |
| T2 | Hierarchy enforced in SQL | — PASS |
| T3 | No idempotency | **CRITICAL** |
| T4 | Bulk partial commit | **HIGH** |
| T5 | Dual-write outside apply_delta | **HIGH** |
| T6 | Authenticated EXECUTE on transfer_panel | **MEDIUM** (intended; monitor grants) |

---

P6_3_MONETARY_INTEGRITY_PROOF_COMPLETE
