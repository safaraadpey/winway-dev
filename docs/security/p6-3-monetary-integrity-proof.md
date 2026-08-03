# P6.3 — Monetary Integrity Proof

> **Mode:** READ ONLY  
> **Date:** 2026-08-03  
> **Prerequisite:** P6.1 threat model · P6.2 deposit domain design  
> **Verdict:** **NO-GO** for real-money deposits until CRITICAL gaps remediated

---

## 1. Intended monetary model (product)

| Operation class | Allowed effect on Σ money |
|-----------------|---------------------------|
| **Deposit Domain** (future) | **Create** money (verified external payment) |
| **Treasury Injection** | Create money only if explicitly approved (today: cashdesk `deposit` adjust — *uncontrolled mint*) |
| **Internal Treasury Transfer** Admin↔Super↔Agent↔Player | **Conserve** — SenderΔ + ReceiverΔ = 0 |
| **Cash-out** | Outside system (manual by Agent/Super/Admin) — in-app burn via cashdesk `withdraw` is the digital twin of handing cash |
| **Player withdrawal** | Does not exist |

Game play (join → settle) is **not** a pure transfer: entry is **held/burned**, then prizes/fees are **reminted**. Integrity requires the **economic identity**  
`Σ entry captures ≈ Σ commissions + Σ prizes (+ documented dust/guarantee gaps)`.

---

## 2. Invariants — proof status

### Invariant A — Only Deposit Domain (or approved Treasury Injection) creates money

| Status | **FAIL (today)** |
|--------|------------------|
| Why | (1) Cashdesk `POST /api/admin/wallet/adjust` `deposit` mints via `fn_wallet_apply_delta` with **no** hierarchy and **no** payment verification. (2) Room/tournament settlement **mints** wins/fees after holds (expected economics, but not Deposit Domain). (3) Tournament **guaranteed_prize** can mint **above** entry pool. (4) Deposit Domain **not implemented**. |
| Impact | Any agent JWT can inflate total IRR liability without external payment (P6.1 R01). |

### Invariant B — Internal transfer: SenderΔ + ReceiverΔ = 0

| Status | **PASS for `fn_wallet_transfer_panel`** · **N/A / FAIL for adjust** |
|--------|---------------------------------------------------------------------|
| Transfer panel | Debit A + credit B same amount; dual `FOR UPDATE`; one function TX |
| Adjust | Unilateral mint/burn — **must not** be classified as transfer |
| apply_delta alone | Single-sided — only OK as Deposit/Injection/game remint/burn |

### Invariant C — Successful wallet mutation ⇒ ledger row(s) in same DB TX

| Status | **PARTIAL FAIL** |
|--------|------------------|
| `fn_wallet_apply_delta` | **PASS** — one `transactions` insert with before/after |
| `fn_wallet_transfer_panel` | **PASS** — balanced pair `transfer_out` + `transfer_in` |
| `fn_wallet_capture_join` / tournament capture | **FAIL vs strict reading** — updates `locked_amount` **without** ledger row |
| Dual-write risk | Transfer bypasses apply_delta (consistency style differs) |

### Invariant D — Wallet balance = ledger projection

| Status | **CONDITIONAL / FRAGILE** |
|--------|---------------------------|
| If projection = signed sum of `transactions` for apply_delta-only users | Holds if only apply_delta used |
| Transfer panel | Writes balances + txs outside apply_delta — projection can match **if** both sides always commit together (they do in one function) |
| Capture without ledger | `locked_amount` not fully explained by ledger alone |
| Drift sources | Partial bulk adjust; future non-atomic deposit; service_role ad-hoc SQL; ACL regress |

**Formal projection (recommended):**

```
spendable_balance(user) = Σ signed(transactions for user)
  where deposit/win/fee_*/transfer_in/join_refund = +
        withdraw/join_hold/transfer_out = −
  (amount always stored positive; sign from type)

liability(user) = wallets.balance + wallets.locked_amount
```

Prove D separately for `balance` vs ledger, and recon `locked_amount` vs open holds.

---

## 3. Path-by-path integrity matrix

| Path | Create? | Destroy? | Duplicate? | Replay? | Race? | Retry≠idempotent? | Partial fail? | Rollback OK? |
|------|---------|----------|------------|---------|-------|-------------------|---------------|--------------|
| **Deposit Domain** | Designed create | No | Guarded by design | Guarded | — | Must be safe | — | — |
| **Wallet Adjust deposit** | **YES mint** | No | Yes if replay | **YES** | Per-wallet lock | **YES extra money** | **YES multi-user** | Per-RPC OK |
| **Wallet Adjust withdraw** | No | **YES burn** | Replay double burn | **YES** | Lock | **YES** | **YES** | Per-RPC OK |
| **Transfer Panel** | No | No | Replay = 2× move | **YES** | Ordered FOR UPDATE | **YES extra moves** | **YES multi-user** | Single transfer OK |
| **Agent→Player / etc.** | Via transfer: conserve | | Same | Same | Same | Same | Same | Same |
| **Prize (room)** | **Remint** after capture | | Settle gated | Room-level OK | Room FOR UPDATE | apply_delta unkeyed | Single settle TX | OK |
| **Refund (release)** | Restores after hold | | Double release risk if unkeyed | Possible | Lock | Possible | | OK in function |
| **Settlement** | Remint fees+wins | Capture burns locked | | Status gate | | | | OK |
| **Commission** | Remint fees | | pending→settled | | | | | OK |
| **Bonus** | None live | | | | | | | |
| **Referral credit** | Orphan RPC / locked | | | service_role only | | | | |
| **Tournament hold** | No (debit) | | entry_hold key helps | Partial | | Better than rooms | | OK |
| **Tournament prize** | Remint; **guarantee may create extra** | | | | | | | OK in function |
| **Manual / Admin credit** | = Adjust deposit | | | | | | | |
| **Admin debit** | = Adjust withdraw | | | | | | | |
| **Capture (no ledger)** | No balance Δ | Locked ↓ (finalizes prior burn) | | | | | | OK but audit gap |

---

## 4. Hierarchy (transfers)

| Actor | DB enforcement (`fn_wallet_transfer_panel`) |
|-------|-----------------------------------------------|
| Admin | Unrestricted targets (among roles allowed by function) |
| Super | Own agents / players in tree (`parent_id` / `player_affiliation`) |
| Agent | Own players; also **direct child agents** (later migration) |
| Player | Cannot call (role gate) |

**Adjust API:** hierarchy **NOT** enforced — **CRITICAL** violation of treasury-tree intent.

Enforcement location: **SQL** for transfer (good); **API-only role check** for adjust (insufficient).

---

## 5. Forbidden operations (CRITICAL if usable)

| Mechanism | Risk |
|-----------|------|
| Client `UPDATE wallets` | Blocked by RLS (no write policies) — **OK if stays** |
| `fn_wallet_apply_delta` by anon/authenticated | **Locked P2.3** — must stay locked |
| Legacy `fn_wallet_add/deposit/...` | ACL locked service_role — still mint if called |
| `fn_adjust_referral_wallet` direct UPDATE | ACL locked; bypasses apply_delta |
| Adjust via service_role without payment | **Live CRITICAL mint** |
| Future webhook → wallet UPDATE | Forbidden by P6.2 design |

---

## 6. GO / NO-GO

### Real-money deposits: **NO-GO**

Blocking reasons:

1. Uncontrolled cashdesk mint (Invariant A).  
2. No Deposit Domain / verified credit path.  
3. No idempotency on adjust/transfer/apply_delta (duplicate money / moves).  
4. Bulk adjust partial success.  
5. Tournament guarantee & settle remint economics undocumented in ops recon.  
6. Capture without ledger weakens D/C proofs.  
7. Transfer dual-write outside apply_delta complicates single-writer proof.

### Internal treasury transfers: **CONDITIONAL GO**

Transfer panel conserves money and locks both wallets with DB hierarchy — **acceptable for offline cash-desk mirroring** only if:

- Idempotency added before high volume  
- Bulk partial-failure fixed  
- Adjust mint tightly controlled or removed from agents  

---

## 7. Document set

| Doc | Focus |
|-----|--------|
| `p6-3-monetary-integrity-proof.md` | This summary |
| `p6-3-transfer-atomicity-audit.md` | Transfer / locks / hierarchy |
| `p6-3-money-conservation.md` | Σ formulas & sinks |
| `p6-3-wallet-ledger-proof.md` | Invariant D |
| `p6-3-remediation-plan.md` | Ordered fixes |

---

P6_3_MONETARY_INTEGRITY_PROOF_COMPLETE
