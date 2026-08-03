# P6.1 — Financial Risk Register

> **READ ONLY** · Prioritized before real-money deposits  
> Classifications: **CRITICAL** · **HIGH** · **MEDIUM** · **LOW**

---

## Legend

| Field | Meaning |
|-------|---------|
| ID | Stable risk id |
| Phase | `NOW` = live system · `PAY` = must solve before gateway/USDT go-live |
| Likelihood | Given current controls |
| Impact | Money loss / integrity |

---

## CRITICAL

| ID | Risk | Phase | Likelihood | Impact | Existing control | Gap |
|----|------|-------|------------|--------|------------------|-----|
| R01 | **Cashdesk mint without payment** — `/api/admin/wallet/adjust` deposit any `userIds` | NOW | Med | Catastrophic | Admin JWT; audit | No agent hierarchy; treasury-level power |
| R02 | **Replay cashdesk adjust/transfer** — duplicate POST credits twice | NOW | High | High | None on request id | No idempotency key |
| R03 | **service_role / engine key leak** — arbitrary apply_delta | NOW | Low | Catastrophic | Env secrecy; P2.3 ACL | Key = master mint |
| R04 | **Forged payment webhook** credits wallet | PAY | High if naive | Catastrophic | N/A | No webhook yet — design required |
| R05 | **Duplicate gateway callback** double credit | PAY | High | Catastrophic | N/A | Need UNIQUE(payment_id) + idempotent credit |
| R06 | **Credit on expired / unpaid invoice** | PAY | Med | Catastrophic | N/A | Status machine required |
| R07 | **USDT fake TX / wrong recipient / wrong token** | PAY | Med–High | Catastrophic | N/A | Verify chain + address bind + depth |
| R08 | **Wallet ≠ ledger** via dual-write (`transfer_panel`) or future non-atomic credit | NOW+PAY | Med | Catastrophic | apply_delta atomic | Transfer bypasses apply_delta |
| R09 | **apply_delta EXECUTE regress** to anon/authenticated | NOW | Low (post-P2.3) | Catastrophic | P2.3 lock | Continuous ACL monitor |
| R10 | **Admin privilege escalation** — agent → unrestricted mint | NOW | Med | Catastrophic | Role string check | Adjust lacks hierarchy / limits |

---

## HIGH

| ID | Risk | Phase | Likelihood | Impact | Notes |
|----|------|-------|------------|--------|-------|
| R11 | Cancel waiting **confused deputy** (`p_user` + service_role) | NOW | Low–Med | High | Must bind refund to true owner |
| R12 | Tournament **hold/entry race** (multi-tab) | NOW | Med | High | Phase 4 documented |
| R13 | Stolen **admin JWT** without MFA | NOW | Med | High | Enables R01 |
| R14 | **Rate-limit gaps** on adjust / join / signup | NOW | High | High | Amplifies abuse |
| R15 | Settlement **double-pay** if status gate bypassed | NOW | Low | High | finished + paid_at help |
| R16 | Payment **amount/currency mismatch** | PAY | Med | High | Bind invoice |
| R17 | Chain **reorg after credit** | PAY | Low–Med | High | Confirmation policy |
| R18 | **Bonus/referral** auto-credit abuse (when added) | PAY | High | High | Absent today |
| R19 | Webhook **no signature / weak secret** | PAY | High if weak | High | |
| R20 | **Idempotency column unused** on most money RPCs | NOW | Med | High | Key exists; rarely set |

---

## MEDIUM

| ID | Risk | Phase | Notes |
|----|------|-------|-------|
| R21 | Join concurrency / insufficient funds edge | NOW | FOR UPDATE mitigates |
| R22 | Commission double distribute | NOW | pending→settled gate |
| R23 | Locked_amount drift vs open holds | NOW | Needs recon job |
| R24 | Ding/IRR confusion in UX or wrong currency debit | NOW | |
| R25 | Audit log gaps on some money paths | NOW | |
| R26 | Janitor refund mis-fire | NOW | Monitor |
| R27 | Invoice enumeration / IDOR on future deposit status API | PAY | |
| R28 | Underpayment dust / overpayment handling unclear | PAY | Policy needed |

---

## LOW

| ID | Risk | Phase | Notes |
|----|------|-------|-------|
| R29 | Client balance display spoof | NOW | Not SoR |
| R30 | Orphan legacy wallet helpers (ACL locked) | NOW | Keep locked |
| R31 | Docs claiming all paths use apply_delta (accuracy) | NOW | Transfer exception |
| R32 | Referral graph farming without credit | NOW | Prep only |

---

## Invariant break register (wallet ≡ ledger)

| Break mode | Risk IDs | Detection |
|------------|----------|-----------|
| Dual-write transfer | R08 | Recon query drift |
| Legacy direct UPDATE if ACL opens | R09, R30 | Grant monitor + recon |
| Non-atomic future deposit | R04–R08 | Code review gate |
| allow_negative misuse | — | Flag callers |
| Manual SQL repair | Process | Change control |

---

## Top 10 risks before enabling real-money deposits

1. **R04/R05/R06** — Webhook/invoice state machine: signature, idempotency, expiry (no double/free credit).  
2. **R07/R17** — USDT verification: recipient, token, amount, confirmation depth, reorg policy.  
3. **R01/R10** — Cashdesk adjust hierarchy + maker-checker (mint is still live risk).  
4. **R02/R20** — Idempotency on all credit paths (cashdesk + payments).  
5. **R08** — Single writer: all credits through `fn_wallet_apply_delta` in one TX with ledger.  
6. **R03** — Protect service_role / engine secrets; rotate; least privilege.  
7. **R09** — Prove and continuously monitor apply_delta ACL (postgres/service_role only).  
8. **R16** — Invoice-bound amount/currency/user; reject mismatches.  
9. **R11/R12** — Harden refund identity binding and tournament hold atomicity.  
10. **R14/R13** — Rate limits + MFA for admin/agent money operations.

---

## Go-live gate (payment phase)

Do **not** enable real deposits until:

- [ ] Payment verification zone designed (see dataflow doc)  
- [ ] Invoice + UNIQUE external payment id  
- [ ] Webhook signature + replay protection  
- [ ] Credit only via apply_delta + idempotency  
- [ ] Wallet↔ledger reconciliation job alerting  
- [ ] Cashdesk controls (hierarchy, idempotency, limits)  
- [ ] USDT rules (if in scope) documented and tested on testnet  
- [ ] No player withdrawal still enforced (or separate full threat pass)

---

## Explicit non-goals of this document

- No code, SQL, or API proposals beyond mitigation *intent*  
- No migration  
- No Production flag changes  

---

P6_1_FINANCIAL_THREAT_MODEL_COMPLETE
