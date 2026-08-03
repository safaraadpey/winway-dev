# Bingo Engine (`bingo-engine`)

سرویس مستقل orchestration بازی بینگو (قرعه، lifecycle روم، تورنومنت).

**Service identity:** `bingo-engine` (health JSON `service` field, startup logs)  
**محل در مونوریپو:** `apps/engines/bingo`  
**سند اصلی migration:** [docs/roadmap/GAME_ENGINE_MIGRATION.md](../../../docs/roadmap/GAME_ENGINE_MIGRATION.md)  
**قرارداد موتورها:** [packages/game-contracts/ENGINE_CONTRACT.md](../../../packages/game-contracts/ENGINE_CONTRACT.md) · [p4-3-engine-contract.md](../../../docs/architecture/p4-3-engine-contract.md)

## ساختار

```
apps/engines/bingo/
  src/
    config/          env و feature flags
    db/              Supabase admin client
    workers/         loopهای زمان‌بندی (draw, room, tournament)
    domain/          منطق بازی (room, draw, tournament)
    commands/        فرمان‌های سطح بالا (join, settle, seat)
    finance/         thin wrappers روی RPCهای مالی DB
    health/          healthcheck HTTP (+ وضعیت Redis)
    metrics/         logging و متریک
    redis/           Upstash: client، leader lock، key prefixes
```

## Upstash Redis

از داشبورد Upstash **Redis URL** (`rediss://...`) را در `.env` قرار دهید:

```env
REDIS_URL=rediss://default:...@....upstash.io:6379
```

بدون `REDIS_URL` / `UPSTASH_REDIS_REST_*` هم engine بالا می‌آید (تک‌replica / local dev).  
با `COORDINATION_STRICT=true` یا `ENGINE_REPLICA_COUNT>1`، workerهای global بدون Redis tick نمی‌زنند (fail-closed).

Runbook: [docs/runbooks/horizontal-scaling-deploy-gate.md](../../../docs/runbooks/horizontal-scaling-deploy-gate.md)

`GET /health` → liveness · `GET /ready` → coordination-aware readiness


```powershell
# From repo root (uses .env.local for clone Supabase)
.\scripts\sync-game-engine-env.ps1   # optional: $env:GAME_RUNTIME='hybrid' first
cd apps/engines/bingo
npm install
npm run dev
curl http://localhost:8080/health
```

See [docs/migration/local-game-engine-rollout.md](../../../docs/migration/local-game-engine-rollout.md).

## نقش‌ها (GAME_ENGINE_ROLES)

| Role | مسئولیت |
|------|---------|
| `scheduler` | waiting→playing، insert draw، next_draw_at |
| `draw-processor` | consume `draw_jobs`، mark، evaluate |
| `tournament-orchestrator` | tick تورنومنت، seat players |

در production می‌توان چند replica با roleهای مختلف اجرا کرد.

## Scheduler gate (`SCHEDULER_ENABLED`)

همه workerهای tick-based (room scheduler، draw processor، room-loop، tournament، dev-player) فقط وقتی `SCHEDULER_ENABLED=true` بالا می‌آیند. پیش‌فرض **خاموش** است تا لوکال با Railway تداخل نکند.

| Env | پیش‌فرض | نقش |
|-----|---------|-----|
| `SCHEDULER_ENABLED` | `false` | `true` روی Railway/production؛ `false` برای local/API-only |

API/health (`GAME_ENGINE_API=true`) بدون scheduler هم کار می‌کند.

## Draw processor — کاهش queue_wait

پیش‌فرض (فاز ۲): **per-room actor** — pick مستقل از پردازش room؛ هر room یک صف سریال. Poll هر ۵۰۰ms فقط fallback است.

| Env | پیش‌فرض | نقش |
|-----|---------|-----|
| `DRAW_PROCESSOR_PER_ROOM_ACTOR` | `true` | pick coordinator + actor سریال per room |
| `DRAW_PROCESSOR_WAKE_ON_ENQUEUE` | `true` | scheduler → wake in-process؛ Realtime روی `draw_jobs` INSERT |
| `DRAW_PROCESSOR_MAX_BATCHES_PER_WAKE` | `4` | دور pick روی enqueue/realtime |
| `DRAW_PROCESSOR_MAX_BATCHES_PER_TICK` | `2` | دور pick روی poll |
| `DRAW_PROCESSOR_INTERVAL_MS` | `500` | safety poll |

برای بازگشت به drain قدیمی (فاز ۱): `DRAW_PROCESSOR_PER_ROOM_ACTOR=false`

متریک‌ها روی `draws`: `queue_wait_ms`, `first_picked_at`, `handler_started_at`, `drain_*`.
