# P4.3 — Engine Boundaries

> Dependency and domain-boundary report for the multi-engine platform.  
> **No code changes** in this document’s findings — inventory only.

Companion: [p4-3-multi-engine-foundation.md](./p4-3-multi-engine-foundation.md) · [p4-3-engine-contract.md](./p4-3-engine-contract.md)

---

## 1. Allowed communication

```
apps/web  (Next.js / Vercel)
    │
    ├── HTTP ──► apps/engines/<name>   (/health, /ready, /v1/*, commands)
    ├── Supabase Auth / Realtime
    └── PostgreSQL (DATABASE_URL) for critical snapshots

apps/engines/<name>
    ├── PostgreSQL / Supabase service role + finance RPCs
    ├── Redis (locks / coordination)
    └── HTTP responses to web (no reverse code imports)
```

**Forbidden:** TypeScript imports across `apps/web` ↔ `apps/engines/*` or between engines’ `src/` trees.

---

## 2. Dependency review (P4.3)

| Direction | Result |
|-----------|--------|
| Web (`app/`, `lib/`, `components/`, `services/`, `src/`) → `apps/engines/*` | **CLEAN** — no module imports |
| `apps/engines/bingo` → Web paths above | **CLEAN** — no module imports |

**Non-violations:**

- `lib/gameEngineClient.ts` / `lib/gameEngine/config.ts` — HTTP + env URL only  
- Comment path mirrors (`lib/provablyFair*.ts` mentioning engine RNG path) — documentation, not imports  

**Violations:** none found.

---

## 3. Bingo-specific inventory

Ball range in this codebase is **UK Housie 1–90** (3×9 / 15 cells), not US 1–75.

### A. Must stay Bingo-specific

| Area | Examples |
|------|----------|
| Card / bitmask model | `apps/engines/bingo/src/core/bitmask/*` |
| Line / full-house evaluation | `winEvaluation.ts`, line-win SQL migrations |
| Draw domain + RNG ordering | `apps/engines/bingo/src/core/rng.ts`, `lib/provablyFairDrawSpec.ts` |
| Card pool generation & tables | `sql/functions/generate_card_pool.sql`, `lib/cardPool/*` |
| `draw_jobs` pipeline | `apps/engines/bingo/src/domain/draw/*` |
| Tickets / marks / card numbers | repositories + card-registry |
| Template reward columns (`line_*`, `full_*`) | settle / template SQL |
| Bingo UI | `components/BingoCard.tsx`, `lib/bingo-logic.ts`, live/game screens |
| Card-pool admin/player APIs | `app/api/**/card-pool/**` |
| “Full winner ends room” settle trigger | `apps/engines/bingo/src/finance/settleRoom.ts` |

### B. Should become engine-agnostic later

| Area | Examples |
|------|----------|
| Room lifecycle shell | waiting→playing, scheduler worker |
| Room claim / lease / actor loop | `workers/room-loop/*` |
| Janitor unsettled-finished pattern | `domain/room/janitorRepair.ts` |
| Join command + JWT auth boundary | `http/commands.ts`, `http/auth.ts` |
| Settle **call site** (RPC wrapper) | `finance/index.ts` — not the ledger math |
| HTTP `/v1` snapshot surface | `http/server.ts`, lobby/gameroom/live-room views |
| Health / ready | `health/server.ts` |
| Redis leader locks | `redis/leaderLock.ts`, key prefixes |
| Tournament tick **shell** | `workers/tournament-orchestrator/*` |
| Docker / Railway deploy pattern | `Dockerfile`, scaling runbook |
| Web HTTP client + feature flags | `lib/gameEngineClient.ts` |

---

## 4. Schema naming reality

Many tables/RPCs use Bingo vocabulary (`draws`, `draw_jobs`, `tickets`, `marks`, `card_pool_*`).  
**P4.3 does not rename schema.** Future engines may:

- use separate schemas/tables, or  
- introduce a generic `game_sessions` layer **later**  

Until then, treat Bingo SQL as Bingo-owned even when orchestration patterns are reusable.

---

## 5. Future migration recommendations (no implementation now)

1. **Keep engines isolated packages** under `apps/engines/<game>/` with their own `package.json` + Dockerfile.  
2. **Extract shared runtime only after Backgammon exists** (health, JWT, Redis locks, lease helpers) → future `packages/*`.  
3. **Do not share wallet/settlement TypeScript** across engines; share **DB contracts**.  
4. **Route web clients by game** (URL / template `engine_type`) when a second engine ships — today all traffic assumes Bingo.  
5. **Leave Bingo UI and card-pool APIs in web** until a second game UI forces a split.  
6. **Preserve `/health` JSON `service` string** (or version it carefully) when renaming for ops clarity.

---

## 6. Boundary checklist for new engines

- [ ] No imports from `apps/web` or other engines  
- [ ] Own Dockerfile + Railway Root Directory  
- [ ] Implements lifecycle in [p4-3-engine-contract.md](./p4-3-engine-contract.md)  
- [ ] Money only via existing/approved finance RPCs  
- [ ] Snapshot API recoverable without realtime  
- [ ] Local `SCHEDULER_ENABLED=false` by default  
