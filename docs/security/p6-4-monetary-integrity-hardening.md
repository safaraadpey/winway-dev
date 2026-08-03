# P6.4 — Monetary Integrity Hardening

Implementation of the P6.3 remediation stack (idempotency, bulk safety, continuous recon, metrics).  
**Out of scope:** Deposit Domain, payment gateways, blockchain, game logic changes.

---

## Bulk strategy (chosen)

**Strategy B — per-item transaction + mandatory idempotency + structured result list**

| | Strategy A (single BEGIN for whole bulk) | Strategy B (chosen) |
|---|---|---|
| Failure mode | One hierarchy/funds failure rolls back everyone | One user fails; others commit |
| Retry | Hard (whole batch) | Safe per item with same id |
| Operator UX | Opaque all-or-nothing | Explicit `results[]` |

Production recommendation: **B**. Multi-user cashdesk batches routinely mix good and bad targets; all-or-nothing creates accidental double-pay risk on naive retry of the whole list.

APIs return:

```json
{
  "ok": false,
  "partial": true,
  "successCount": 2,
  "failureCount": 1,
  "results": [
    { "userId": "...", "success": true, "transferId": "...", "replayed": false, "clientRequestId": "..." }
  ]
}
```

HTTP: `200` all ok · `207` partial · `500` all failed · `400` validation.

---

## Transfer idempotency

- RPC: `fn_wallet_transfer_panel(target, amount, action, client_request_id, description, meta)`
- Table: `wallet_transfer_idempotency` UNIQUE `(actor_id, client_request_id)`
- Same id → return previous `transfer_id`, `replayed=true`, **no second money move**
- Same id + different payload hash → `idempotency_payload_mismatch`
- Hierarchy rules unchanged (enforced in SQL)
- API: `POST /api/admin/wallet/transfer` requires `clientRequestIds[]` parallel to `userIds[]`

---

## apply_delta idempotency

- Optional 10th arg `p_idempotency_key` (default NULL)
- Unique index `ux_tx_idempotency` on `transactions.idempotency_key`
- Replay returns original transaction id; payload mismatch rejects
- Ready for future Deposit Domain / Treasury Injection keys
- API adjust: **requires** `idempotencyKeys[]` (Strategy B)

---

## Continuous reconciliation (report only — no auto-repair)

| Job | Function | Checks |
|-----|----------|--------|
| Wallet↔Ledger | `fn_recon_wallet_ledger` | `balance == Σ(balance_after - balance_before)` |
| Money conservation | `fn_recon_money_conservation` | `Σ transfer_in == Σ transfer_out`; treasury injections separate; room capture≈fees+wins noted; tournament guarantee noted in report text |
| Combined store | `fn_recon_run_and_store` → `finance_recon_reports` | Append-only |

Endpoints:

- `POST /api/cron/finance-reconcile` — `Authorization: Bearer $CRON_SECRET` or admin JWT
- `POST /api/admin/finance/reconcile` — admin/super
- `GET /api/admin/finance/metrics` — counters

On drift: log `[Wallet] finance recon DRIFT` and increment `failed_reconciliation`. **Never** mutates balances.

---

## Metrics (in-process)

| Metric | Meaning |
|--------|---------|
| `wallet_drift` / `ledger_drift` | Last recon drift count |
| `duplicate_transfer_attempts` | Replay or payload-mismatch transfer |
| `duplicate_apply_delta_attempts` | Replay or payload-mismatch adjust |
| `failed_reconciliation` | Recon status ≠ ok or RPC error |
| `partial_bulk_failure` | Bulk with mixed success |

Note: counters are process-local (not a durable TSDB). Pair with `finance_recon_reports` for durable history.

---

## SQL migrations

1. `20260803160000_p6_4_monetary_integrity_hardening.sql`
2. `20260803161000_p6_4_recon_public_wrappers.sql`
3. `20260803161500_p6_4_transfer_idempotency_ambiguous_fix.sql`
4. `20260803162000_p6_4_recon_projection_via_balance_delta.sql`

---

## Tests

```bash
npm run test:finance-integrity
```

Covers: duplicate transfer, duplicate apply_delta, concurrent transfer, deadlock avoidance, wallet↔ledger local invariant, conservation, bulk retry.

---

## Deposit GO status

P6.4 closes idempotency + bulk + continuous recon visibility.  
**Still NO-GO for real player deposits** until Deposit Domain (P6.2) and cashdesk mint controls land.

P6_4_MONETARY_INTEGRITY_HARDENED
