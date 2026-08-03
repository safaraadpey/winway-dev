# HamiPay deposit — schema mapping & mismatches

## Reuse (no parallel credit path)

We **reuse** P6.5 `deposit.*` + `deposit.fn_post_credit` → `fn_wallet_apply_delta`.  
We do **not** invent a second wallet credit mechanism.

| Requested field | Mapping |
|-----------------|--------|
| deposit UUID | `deposit.intents.id` |
| user_id | `deposit.intents.user_id` (from session only) |
| amount | `amount_expected` in **wallet toman units**, currency `IRR` |
| provider | `provider = 'hamipay'`, `channel = 'fiat_gateway'` |
| environment | column `environment` (`development` \| `production`) |
| status | existing `deposit.intent_status` |
| merchant_order_id | column `merchant_order_id` (= intent id text) |
| provider_payment_id | `provider_intent_ref` |
| payment_url | column `payment_url` |
| credited_at | `deposit.credits.posted_at` (authoritative) |

## Status mapping

| Requested | Existing enum |
|-----------|---------------|
| created | `created` |
| pending | `pending` (after HamiPay create + activate) |
| failed_to_create | keep `created` + `metadata.create_failed` **or** move to `failed` via new transition `created→failed` |
| credited | `credited` |
| failed/cancelled | `rejected` / `failed` |

## Amount unit mismatch (critical)

- Wallet SoR + Deposit Domain: **toman-scale** amounts under currency code `IRR`.
- BuyRial UI input is labeled **ریال**; convert with `floor(rial/10)` before create-intent.
- HamiPay requests send amount in provider unit (`HAMIPAY_AMOUNT_UNIT=toman|rial`, default `toman` = wallet unit; `rial` = toman×10).
- Verification converts provider amount back to wallet toman before `fn_pass_verification`.

## Missing before this work

- No player deposit API routes
- No HamiPay adapter
- No callback page
- No deposit reconcile cron that re-queries provider
- `created → failed` transition not allowed (added in migration)

## Non-destructive policy

- No drop of deposit tables
- Additive columns only
- Additive transition rules only
