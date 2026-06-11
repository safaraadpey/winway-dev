# Game Engine

سرویس مستقل orchestration بازی (قرعه، lifecycle روم، تورنومنت).

**سند اصلی migration:** [docs/roadmap/GAME_ENGINE_MIGRATION.md](../docs/roadmap/GAME_ENGINE_MIGRATION.md)

## ساختار

```
game-engine/
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
اگر Redis configure شده ولی ping یا lock fail شود، engine **degrade** می‌کند و بدون lock ادامه می‌دهد (همه workerها از جمله dev-player).

`GET /health` → `{ ok, redis: "up" | "down" | "disabled" }`


```powershell
# From repo root (uses winway/.env.local for clone Supabase)
..\scripts\sync-game-engine-env.ps1   # optional: $env:GAME_RUNTIME='hybrid' first
cd game-engine
npm install
npm run dev
curl http://localhost:8080/health
```

See [docs/migration/local-game-engine-rollout.md](../docs/migration/local-game-engine-rollout.md).

## نقش‌ها (GAME_ENGINE_ROLES)

| Role | مسئولیت |
|------|---------|
| `scheduler` | waiting→playing، insert draw، next_draw_at |
| `draw-processor` | consume `draw_jobs`، mark، evaluate |
| `tournament-orchestrator` | tick تورنومنت، seat players |

در production می‌توان چند replica با roleهای مختلف اجرا کرد.
