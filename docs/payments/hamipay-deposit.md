# HamiPay deposit (DingMoney)

## Environment variables (server-only)

```bash
# Preferred explicit gate (Vercel Production for winway-dev = dev.dingmoney.org)
DEPOSIT_DOMAIN_ENABLED=true

# Live HamiPay (also unlocks create when DEPOSIT_DOMAIN_ENABLED is unset,
# unless DEPOSIT_DOMAIN_ENABLED=false explicitly)
HAMIPAY_API_KEY=...                 # NEVER NEXT_PUBLIC_
HAMIPAY_API_BASE_URL=https://api.example.com

# Optional path overrides
HAMIPAY_CREATE_PATH=/v1/payments
HAMIPAY_STATUS_PATH=/v1/payments/{paymentId}

# Provider amount unit for create/status payloads
# rial = wallet_toman * 10 (default); toman = same as wallet unit
HAMIPAY_AMOUNT_UNIT=rial

# Return URL base (no trailing slash)
# production: https://dingmoney.org
# development: https://dev.dingmoney.org
HAMIPAY_RETURN_BASE_URL=https://dev.dingmoney.org

# Deposit domain gate
DEPOSIT_DOMAIN_ENABLED=true
DEPOSIT_ENVIRONMENT=development   # or production — isolates wallets/env

# Amount limits (wallet toman units)
DEPOSIT_MIN_AMOUNT_TOMAN=10000
DEPOSIT_MAX_AMOUNT_TOMAN=500000000

# Cron
CRON_SECRET=...

# Local mock (no real HamiPay calls)
HAMIPAY_MOCK=true
HAMIPAY_MOCK_STATUS=paid
```

Return URLs used:

- production: `https://dingmoney.org/payment/callback?depositId=<uuid>`
- development: `https://dev.dingmoney.org/payment/callback?depositId=<uuid>`

## Flow

1. Buy Rial UI → `POST /api/player/deposit/create` `{ amountRial }`
2. Server creates `deposit.intents` (hamipay / fiat_gateway), calls HamiPay with Idempotency-Key=depositId
3. Browser redirects to `paymentUrl` (wallet untouched)
4. Return → `/payment/callback` shows «در حال بررسی…» → `POST /api/player/deposit/verify` `{ depositId }`
5. Server polls HamiPay, binds amount/merchantOrderId/paymentId/environment, then:
   `fn_record_attempt` → `fn_begin_verification` → `fn_pass_verification` → `fn_post_credit` → `fn_wallet_apply_delta`
6. Cron `POST /api/cron/deposit-reconcile` (Bearer CRON_SECRET) re-verifies stuck pending deposits

## Test procedure (mock)

```bash
# .env.local
DEPOSIT_DOMAIN_ENABLED=true
HAMIPAY_MOCK=true
HAMIPAY_MOCK_STATUS=paid
DEPOSIT_ENVIRONMENT=development

npm run test:hamipay-deposit
```

Manual UI:

1. Open `/player/wallet/buy-rial`, enter amount (≥ 100000 rial → 10000 toman)
2. Confirm → see «در حال اتصال به درگاه پرداخت...»
3. Land on callback → verify → wallet credited once
4. Re-hit verify → same credited result, no second ledger row

## Security checklist

- No HamiPay calls from client components
- No API key in NEXT_PUBLIC_*
- No frontend wallet mutation
- Create/verify rate-limited per user
- Session + ownership + amount + provider IDs + environment checked server-side
