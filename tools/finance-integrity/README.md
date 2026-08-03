# Finance integrity (P6.4)

Regression suite against `DATABASE_URL` (`.env.local`).

```bash
npm run test:finance-integrity
```

Deterministic checks: transfer/apply_delta idempotency, concurrency, deadlock avoidance, wallet↔ledger local invariant, conservation report, bulk retry.
