# P6.5 — Deposit Domain Foundation

> Fake / simulated payments only. **No** real fiat gateway or TRON/USDT mainnet.

Prerequisite: P6.2 design · P6.4 monetary integrity hardening.

---

## What shipped

| Layer | Content |
|-------|---------|
| Schema | `deposit` — intents, attempts, verifications, credits, events, recon_reports |
| SQL lifecycle | create → activate → attempt → begin/pass/fail verify → expire → post credit → status |
| Credit | `deposit.fn_post_credit` → `fn_wallet_apply_delta` in **one TX** |
| Adapter | `lib/deposit/fakeAdapter.ts` — evidence only |
| Flag | `DEPOSIT_DOMAIN_ENABLED=false` (default) |
| Tests | `npm run test:deposit-domain` |

Cashdesk is **not** routed through Deposit Domain.

---

## Feature flags

| Env | Default | Meaning |
|-----|---------|---------|
| `DEPOSIT_DOMAIN_ENABLED` | unset/false | Production ingress rejected |
| `DEPOSIT_DOMAIN_TEST_MODE` | unset/false | Allows harness/fake flow when domain disabled |

---

## Credit path

```
verified intent (confirmed)
  → deposit.fn_post_credit
  → fn_wallet_apply_delta (source_kind=deposit_domain, idempotency_key=…)
  → transactions + wallets
  → credits.status=posted + intent.status=credited
  → deposit.events
```

No direct `UPDATE wallets`. No engine. No cashdesk fallback.

Idempotency key forms:

- fake: `deposit:fake:{provider}:{payment_id}`
- fiat (future): `deposit:fiat:{provider}:{payment_id}`
- tron (future): `deposit:tron:{txid:index}`

---

## Explicit non-goals (stop here)

- Real payment gateway webhooks
- Blockchain watchers / hot wallets
- Player withdrawals
- Manual cashdesk adapter

---

## Related

- `docs/testing/p6-5-deposit-domain-validation.md`
- `docs/security/p6-5-deposit-acl-review.md`
- `docs/architecture/p6-2-deposit-domain-model.md`

P6_5_DEPOSIT_DOMAIN_FOUNDATION_READY_FOR_TEST
