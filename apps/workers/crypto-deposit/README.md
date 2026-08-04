# Crypto deposit worker (`@dingmoney/crypto-deposit-worker`)

Railway **Node/Nixpacks** service. Thin scheduler around
`@dingmoney/deposit-core` (shared scan/credit/notify — no duplicated logic).

`/api/cron/crypto-scan-*` on Next remain optional manual/admin endpoints.

## What it runs

| Loop | Default interval | Function |
|------|------------------|----------|
| Active (Layer 2) | 2 minutes | `runActiveCryptoScan` |
| Full offline (Layer 3) | 6 hours | paginated `runFullOfflineCryptoScan` |

Redis NX locks: `crypto_deposit:lock:*` (via deposit-core redis helper).

## Local

From **repo root** (workspaces):

```powershell
npm install
cd apps/workers/crypto-deposit
# copy .env.example → .env
npm run dev
curl http://localhost:8080/health
```

## Railway (dashboard)

| Setting | Value |
|---------|--------|
| **Root Directory** | *empty* / repository root (`/`) |
| **Builder** | Nixpacks (Node) — not Dockerfile |
| **Build Command** | `npm ci` |
| **Start Command** | `npm run start -w @dingmoney/crypto-deposit-worker` |
| **Health check** | `GET /health` (port `CRYPTO_DEPOSIT_HTTP_PORT`, default `8080`) |

Root Directory must be `/` so npm workspaces can link `packages/deposit-core`.
Override Next auto-detect with the Build/Start commands above.

Env: see `.env.example`. Keep **1 replica** until Upstash locks are verified.
