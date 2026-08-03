# P6.3 — Wallet ↔ Ledger Proof

> **READ ONLY** · Invariant D

---

## 1. Statement

```
wallets.balance(user, currency)
  ≡  LedgerProjection(user, currency)
```

Ledger SoR table: `public.transactions`  
Primary writer: `game_finance.fn_wallet_apply_delta`  
Secondary writer: `fn_wallet_transfer_panel` (pair inserts + direct balance UPDATE)

---

## 2. Projection definition

`transactions.amount` is always **positive**. Sign from `type`:

| Types (credit +) | Types (debit −) |
|------------------|-----------------|
| `deposit`, `win`, `join_refund`, `transfer_in`, `fee_agent`, `fee_super`, `fee_admin`, `tournament_prize`, `tournament_commission`, … | `withdraw`, `join_hold`, `transfer_out`, … |

```
Projection = Σ credit_amounts − Σ debit_amounts
```

Must match `wallets.balance` (not `locked_amount`).

---

## 3. Proof by construction — apply_delta path

In `fn_wallet_apply_delta`:

1. `FOR UPDATE` wallet  
2. `balance_after = balance_before + delta`  
3. `UPDATE wallets.balance`  
4. `INSERT transactions` with `balance_before` / `balance_after`

⇒ **For that call**, local invariant holds.  
Replay without idempotency ⇒ **new** consistent state (wrong economically, still locally consistent).

---

## 4. Proof by construction — transfer path

In `fn_wallet_transfer_panel`:

1. Lock both wallets  
2. Update both balances  
3. Insert out + in rows with matching amounts  

⇒ Pair conserves; each side’s projection moves by ±amount if types signed correctly.

**Gap:** not using apply_delta ⇒ tooling that only trusts apply_delta misses these writes unless it scans all txs.

---

## 5. Break points (Invariant D)

| Break | Severity | Mechanism |
|-------|----------|-----------|
| Direct `UPDATE wallets` without tx | **CRITICAL** | Legacy helpers / referral adjust if EXECUTE regained; ad-hoc SQL |
| Capture changes `locked` only | **MEDIUM** | D for **balance** OK; liability audit incomplete |
| Bulk adjust partial | **HIGH** | Some users updated; operator retries → duplicate risk |
| Failed insert after update | **LOW** in apply_delta | Same function TX |
| Wrong type sign in projection job | **HIGH** ops | Misclassified fee/win |
| Currency mismatch | **MEDIUM** | IRR assumed |

---

## 6. locked_amount

Not part of balance projection. Open holds must equal:

- Sum of uncaptured room ticket holds, and/or  
- Open `tournament_locks`

Else **liability drift** even if D holds for spendable balance.

---

## 7. Empirical proof requirement (ops)

Daily job:

```
FOR each wallet:
  assert abs(balance - projection) < ε
ALERT if any row fails
```

Until this runs in prod, D is **design-proved for happy paths only**, not continuously evidenced.

**Status today:** **NOT CONTINUOUSLY PROVED** → treat as **HIGH** residual for deposit go-live.

---

## 8. Findings

| ID | Finding | Severity |
|----|---------|----------|
| L1 | apply_delta locally maintains D | PASS |
| L2 | transfer_panel maintains D if pair always commits | PASS |
| L3 | No continuous recon job documented in-app | **HIGH** |
| L4 | Dual writer complexity | **HIGH** |
| L5 | Capture/ledger gap for locks | **MEDIUM** |
| L6 | Client wallet UPDATE | PASS (RLS) |

---

P6_3_MONETARY_INTEGRITY_PROOF_COMPLETE
