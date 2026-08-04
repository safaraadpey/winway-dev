# Crypto deposit worker (`@dingmoney/crypto-deposit-worker`)

Railway **Node/Nixpacks** service. Thin scheduler around
`@dingmoney/deposit-core` (shared scan/credit/notify — no duplicated logic).

`/api/cron/crypto-scan-*` on Next remain optional manual/admin endpoints.

## Watch tiers

| Tier | Interval | Entry | Exit |
|------|----------|-------|------|
| **Confirmation** | 15s | PENDING crypto tx | CONFIRMED / no PENDING |
| **Hot** | 15s | Deposit page / check deposit / activity (1h sliding) | TTL expiry or Confirm exclusive |
| **Warm** | 30s | Online (`users.last_seen_at` &lt; 2m) + allocated address, not Hot/Confirm | Offline |
| **Cold** | 6h | All allocated addresses excluding Confirm/Hot/Warm | — |

Priority: Confirmation &gt; Hot &gt; Warm &gt; Cold (exclusive membership at scan time).

Locks: NX + **immediate `DEL` in `finally`**. TTL is crash-recovery only.

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

**Must share** `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` with the Next.js app (Vercel) so Hot Watch registrations are visible to the worker.

Env: see `.env.example`. Keep **1 replica** until Upstash locks are verified.
