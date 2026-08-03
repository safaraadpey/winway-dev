# P6.5 — Deposit Domain Validation

## Command

```bash
npm run test:deposit-domain
```

Requires `DATABASE_URL` in `.env.local`. Sets `DEPOSIT_DOMAIN_TEST_MODE=true` for the process.

## Coverage

| Case | Asserts |
|------|---------|
| Happy path fake payment | confirmed→credited, ledger_tx_id, +amount once |
| Duplicate callback | UNIQUE attempt event id |
| Duplicate credit | replayed=true, same ledger_tx_id |
| Duplicate external payment | second pass blocked |
| Wrong amount / currency | fail verification → rejected |
| Expired intent | verify fail + expire job |
| Forged attempt | unauthorized, stays pending |
| Verification retry | soft fail → observed → pass → credit |
| Crash after confirm | recon `confirmed_not_credited` → credit recovery |
| Concurrent credits | single ledger_tx, +amount once |
| Ledger link | deposit_domain before/after |
| ACL | authenticated cannot SELECT deposit.* |
| Forbidden transitions | expired/rejected↛credited |
| Append-only | attempts DELETE blocked |
| Recon report | stored |

## Expected

```
P6_5_DEPOSIT_DOMAIN_TESTS_PASS
```

## Manual fake scenarios (service)

`lib/deposit/fakeAdapter.ts` scenarios: `paid`, `duplicate_callback`, `wrong_amount`, `wrong_currency`, `expired_invoice`, `forged_callback`, `temporary_verification_error`.

Orchestration: `runFakeDepositFlow` (requires test mode or domain enabled).

P6_5_DEPOSIT_DOMAIN_FOUNDATION_READY_FOR_TEST
