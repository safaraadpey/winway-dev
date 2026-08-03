# P6.3 — Remediation Plan

> **READ ONLY** · Ordered fixes · **No implementation in this phase**  
> Target: restore path to **GO** for real-money deposits

---

## Verdict reminder

**NO-GO** for real-money deposits until CRITICAL items below are closed.

Internal transfers are **structurally sound** (atomic, hierarchical) but need idempotency before scale.

---

## Priority stack

### P0 — CRITICAL (block deposits)

| # | Remediation | Closes |
|---|-------------|--------|
| P0.1 | **Deposit Domain** credit-only mint (P6.2) — verified external payment | Invariant A for players |
| P0.2 | **Cashdesk adjust:** remove agent mint **or** enforce hierarchy + limits + maker-checker; add **idempotency_key** | R01, R02, Invariant A |
| P0.3 | **Idempotency** on `fn_wallet_apply_delta` when key provided; require key from adjust/deposit credit | Duplicate money |
| P0.4 | **Transfer idempotency** (client request id UNIQUE) | Duplicate moves |
| P0.5 | Prove **apply_delta ACL** remains postgres/service_role only (monitor) | R09 |
| P0.6 | **Wallet↔ledger recon job** + alert | Invariant D continuous |

### P1 — HIGH

| # | Remediation | Closes |
|---|-------------|--------|
| P1.1 | Bulk adjust/transfer: all-or-nothing TX or per-item idempotent results | Partial fail |
| P1.2 | Transfer via apply_delta×2 in one function **or** formally accept dual-writer + tests | Single-writer story |
| P1.3 | Document tournament **guarantee** as Approved Injection; recon job | Conservation C5 |
| P1.4 | Room settle recon: capture vs fees+wins | C4 |
| P1.5 | Ledger row or event on **capture** (audit) | Invariant C gap |
| P1.6 | MFA + rate limits on money admin APIs | R13/R14 |

### P2 — MEDIUM / LOW

| # | Remediation |
|---|-------------|
| P2.1 | Keep referral/legacy helpers locked; delete or mark obsolete |
| P2.2 | locked_amount vs open holds recon |
| P2.3 | Dust policy (rounding) documented |
| P2.4 | Split deposit worker role from game engine service_role (P6.2) |

---

## Suggested sequence

```
1. P0.5 ACL monitor + P0.6 recon          (visibility)
2. P0.2–P0.4 cashdesk + transfer + apply_delta idempotency
3. P6.4+ Deposit Domain schema/credit (P6.2 roadmap Phase A–B)
4. P1 settle/guarantee recon
5. Fiat sandbox → gated prod
```

---

## GO criteria (deposits)

- [ ] Player balance increases **only** via Deposit Domain credit (or explicitly audited Treasury Injection RPC — not free agent adjust)  
- [ ] Cashdesk agent cannot unrestricted mint  
- [ ] Idempotent credits and transfers  
- [ ] Recon: balance ≡ ledger (zero drift)  
- [ ] Recon: room/tournament conservation within ε  
- [ ] Transfer still hierarchy-enforced in SQL  
- [ ] No webhook→wallet bypass  

---

## Finding index (all severities)

| Sev | Count (approx) | Themes |
|-----|----------------:|--------|
| CRITICAL | 5+ | Cashdesk mint, no deposit domain, idempotency gaps, ACL regress risk |
| HIGH | 6+ | Bulk partial, dual-write, guarantee, recon missing, settle unreconciled |
| MEDIUM | 4+ | Capture ledger gap, locked drift, currency |
| LOW | 2+ | Display, orphan helpers |

---

## Explicit non-actions (P6.3)

No SQL, API, wallet, ledger, or migration changes in this phase.

---

P6_3_MONETARY_INTEGRITY_PROOF_COMPLETE
