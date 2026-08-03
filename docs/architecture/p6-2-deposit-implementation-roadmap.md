# P6.2 — Deposit Implementation Roadmap

> **READ ONLY** · Phased plan · **Do not implement in P6.2**  
> Stop conditions respect P6.1 go-live gate.

---

## 0. Principles for every phase

1. Wallet credit **only** via Deposit Creditor → `fn_wallet_apply_delta`  
2. Adapters **never** mutate wallet  
3. Exactly-once idempotency keys as designed  
4. No player withdrawal scope creep  
5. Cashdesk unchanged until Phase D decision  
6. Game engine never gains deposit credit EXECUTE  

---

## Phase A — Schema & domain core (no external money)

**Goal:** Persist intents/attempts/verifications/credits/events + state machine RPCs.

| Deliverable | Notes |
|-------------|-------|
| `deposit` schema + tables | Per domain model |
| ACL / RLS / worker role | Per security boundary |
| `fn_create_intent`, expire job | User create own intent |
| In-memory/fake adapter for tests | Evidence only |
| Creditor calling apply_delta | Behind feature flag off in prod |
| Unit tests: transitions, forbidden paths | |
| Reconcile job v0 | confirmed-without-credit |

**Exit:** Domain works with **simulated** verification; **no** real gateway.

---

## Phase B — Fiat gateway adapter (sandbox)

| Deliverable | Notes |
|-------------|-------|
| FiatGatewayAdapter + webhook ingress | Signature verify |
| Sandbox provider end-to-end | |
| Attempt replay tests | |
| Metrics + alerts | |
| Runbook: forged/duplicate/expired | |

**Exit:** Sandbox paid → `credited`; wallet≡ledger for deposit credits; P6.1 R04–R06 controls demonstrated.

**Prod fiat:** only after security review + go-live checklist.

---

## Phase C — USDT / TRON adapter (testnet)

| Deliverable | Notes |
|-------------|-------|
| Address/memo allocation | |
| TronUsdtAdapter + confirmations | |
| Reorg/underpay/overpay policy tests | |
| Watcher ≠ web tier secrets | |

**Exit:** Testnet credit exact-once; duplicate txid safe.

---

## Phase D — Cashdesk relationship (optional)

| Option | When |
|--------|------|
| Keep separate + harden adjust (idempotency, hierarchy) | **Recommended next for R01/R02** even if not in Deposit Domain |
| ManualDepositAdapter | Only after cashdesk controls exist |

**Do not** silently route panel mint through weak manual adapter.

---

## Phase E — Production hardening

| Item | |
|------|--|
| Dual-key webhook secrets | |
| Load / abuse tests on ingress | |
| Legal retention + PII redaction | |
| Continuous ACL monitor (apply_delta + deposit_*) | |
| Wallet/ledger drift alerts paging | |
| Incident playbook: reverse (status only until withdrawals exist) | |

---

## Phase F — Explicit non-goals (until separate program)

- Player withdrawals / cash-out  
- Auto-credit overpayments  
- Instant credit on 0-conf  
- Engine-initiated deposits  
- Client-side “force confirm”  

---

## Suggested sequencing vs product

```
P6.2 Design (this doc)          ✅
P6.3 Cashdesk hardening         (parallel — reduces live mint risk)
P6.4 Deposit schema + fake E2E
P6.5 Fiat sandbox
P6.6 Fiat production (gated)
P6.7 USDT testnet → gated prod
```

---

## Go-live checklist (fiat prod)

- [ ] Signature + merchant allowlist  
- [ ] UNIQUE payment id + credit idempotency  
- [ ] Expiry enforced at confirm and credit  
- [ ] Credit one TX with apply_delta  
- [ ] Confirmed-not-credited alert  
- [ ] Drift recon for deposit_domain  
- [ ] Worker role ≠ engine role  
- [ ] Runbook signed off  
- [ ] Feature flag default off → canary → full  

---

## Document index

| Doc | Topic |
|-----|-------|
| `p6-2-deposit-domain-model.md` | Entities |
| `p6-2-deposit-lifecycle.md` | States, money contract, failures |
| `p6-2-payment-adapter-contract.md` | Adapters + zone |
| `docs/security/p6-2-deposit-security-boundary.md` | Trust, ACL, observability |
| `p6-2-deposit-implementation-roadmap.md` | This file |

---

P6_2_DEPOSIT_DOMAIN_DESIGN_COMPLETE
