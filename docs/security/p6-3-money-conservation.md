# P6.3 — Money Conservation

> **READ ONLY** · System-wide Σ money

---

## 1. Definitions

| Symbol | Meaning |
|--------|---------|
| `B` | `Σ wallets.balance` (IRR) |
| `L` | `Σ wallets.locked_amount` (IRR) |
| `Liab` | `B + L` = gross user liability |
| `D_ext` | External verified deposits (Deposit Domain) — **future** |
| `D_cash` | Cashdesk adjust `deposit` mints |
| `W_cash` | Cashdesk adjust `withdraw` burns (digital stand-in for offline cash-out) |
| `G` | Tournament guarantee mint (prize − entry pool when positive) |
| `M_game` | Game remints: `win` + `fee_*` + tournament prizes/commissions |
| `Burn_cap` | Entry value finalized at capture (balance already reduced at hold) |
| `Dust` | Rounding unallocated in settle splits |

---

## 2. Conservation claims

### Claim 1 — Internal transfers conserve `B`

```
ΔB_transfer = 0
```

**Status: PROVED** for `fn_wallet_transfer_panel` (atomicity audit).

### Claim 2 — Hold conserves per-user `balance + locked`

```
hold:  Δbalance = −p,  Δlocked = +p  ⇒  Δ(balance+locked) = 0
release: inverse
```

**Status: PROVED** in hold/release SQL.

### Claim 3 — Capture reduces liability without ledger remint

```
capture: Δlocked = −p, Δbalance = 0  ⇒  ΔLiab = −p
```

Money is **destroyed** from locked memo (already removed from spendable at hold).  
Later settle **creates** approximately `p` as fees+prizes.

**Economic identity (rooms):**

```
Burn_cap ≈ M_game_room + Dust
```

**Status: INTENDED but not continuously reconciled** — **HIGH** ops gap.  
Rounding dust ⇒ small destroy. Fee rollback-to-admin still mints (redirect).

### Claim 4 — No external deposit ⇒ no net create except cashdesk / guarantee / bugs

Today:

```
ΔLiab ≈ D_cash − W_cash + G + (M_game − Burn_cap) + bugs
```

With ideal room settle `M_game ≈ Burn_cap`:

```
ΔLiab ≈ D_cash − W_cash + G + dust_errors + duplicate_replays
```

**Invariant A** requires `D_cash` either **zero** for agents or elevated to “approved Treasury Injection” with controls — **currently FAIL**.

### Claim 5 — Future Deposit Domain

```
Σ D_ext + Σ Approved_Injection
  = Σ B + Σ L_open_holds + Σ Burn_captured_not_yet_reminted
    + Σ W_cash_offline_mirrored
    − Σ accounting adjustments
```

Exact ops formula must version when Deposit Domain ships.

---

## 3. Legitimate sinks / sources

| Kind | Create/Destroy | Legitimate? |
|------|----------------|-------------|
| Deposit Domain credit | Create | **Yes** (future) |
| Cashdesk deposit | Create | Only as **Approved Injection** — today too loose |
| Cashdesk withdraw | Destroy | Proxy for offline cash-out — OK if audited |
| Transfer | Neither | Yes |
| Hold/release | Neither on Liab | Yes |
| Capture | Destroy Liab | Yes (entry consumed) |
| Settle remint | Create | Yes if ≤ captured + documented guarantee |
| Tournament guarantee excess | Create | **Product choice** — must be explicit injection |
| Replay adjust/transfer | Create/move illicit | **No** |
| Bonus/referral | Create | None live |

---

## 4. Reconciliation jobs (design — not implemented)

| Job | Query intent | Alert |
|-----|--------------|-------|
| R-TRANS | Sum transfer_in − transfer_out = 0 globally | ≠ 0 |
| R-HOLD | locked vs open tickets/locks | drift |
| R-ROOM | per finished room: captures vs fees+wins | drift > dust ε |
| R-Tourney | entry captures + guarantee vs prizes+comms | |
| R-LEDGER | balance vs signed tx projection | |
| R-MINT | Σ deposits (manual_panel) by actor | anomaly |

---

## 5. Findings

| ID | Finding | Severity |
|----|---------|----------|
| C1 | Transfer conserves | PASS |
| C2 | Hold conserves liab | PASS |
| C3 | Capture burns without tx row | MEDIUM (audit) |
| C4 | Settle remint ≈ burn | HIGH if unreconciled |
| C5 | Guarantee can create net money | **HIGH** (must classify as injection) |
| C6 | Cashdesk mint unbounded | **CRITICAL** |
| C7 | No D_ext yet | CRITICAL for real deposits go-live |

---

P6_3_MONETARY_INTEGRITY_PROOF_COMPLETE
