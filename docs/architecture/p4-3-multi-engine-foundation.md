# P4.3 — Multi-Engine Foundation

> **Phase:** Convert single-engine layout into a permanent multi-engine platform shell.  
> **Date:** 2026-08-03  
> **Behavior:** Unchanged — path/docs only (+ Backgammon placeholder).  
> **Not done:** shared packages, Backgammon implementation, Railway new services, commit/push.

Companions:

- [p4-3-engine-contract.md](./p4-3-engine-contract.md)
- [p4-3-engine-boundaries.md](./p4-3-engine-boundaries.md)
- Prior: [p4-2-engine-migration.md](./p4-2-engine-migration.md)

---

## 1. What changed

| Action | Detail |
|--------|--------|
| Rename (git history) | `apps/game-engine` → `apps/engines/bingo` |
| Placeholder | `apps/engines/backgammon/README.md` only |
| Path updates | `.gitignore`, `tsconfig` exclude, env sync scripts, env example comments, docs, lib path comments, bingo README |
| Code / SQL / APIs / wallet | **Not modified** |

---

## 2. New repository tree (engines)

```
apps/
└── engines/
    ├── bingo/                 # live Bingo orchestration engine (was apps/game-engine)
    │   ├── Dockerfile
    │   ├── package.json
    │   ├── src/
    │   ├── scripts/
    │   └── …
    └── backgammon/            # PLACEHOLDER — no package/runtime yet
        └── README.md

# Unchanged in this phase
app/ … public/                 # Next.js still at repo root (Vercel)
sql/                           # canonical migrations
scripts/                       # ops scripts (paths updated for bingo)
```

---

## 3. Engine lifecycle (summary)

Every engine must support the logical ops documented in [p4-3-engine-contract.md](./p4-3-engine-contract.md):

`start` → `health` → (`claimRoom` / `processGame` / `releaseRoom`)* → `settle` → `publishEvents` → `shutdown`

Bingo implements these inside `apps/engines/bingo` today without a shared interface type.

---

## 4. Engine responsibilities

| Layer | Owns |
|-------|------|
| **Web (`/` Next app)** | UI, BFF API routes, player/admin UX, HTTP client to engine URL |
| **Bingo engine** | Draw/mark/evaluate, room actor loop, tournament tick **for Bingo**, engine HTTP `/v1` |
| **PostgreSQL** | Wallets, settlement RPCs, durable rooms/tickets/draws, identity |
| **Redis** | Engine coordination locks (per engine deployment) |
| **Future Backgammon engine** | Backgammon rules + its own claim/process/settle orchestration |

---

## 5. Deployment model (Railway readiness)

**Do not create new Railway services in this phase.** Document only.

### Current (Bingo)

| Setting | Value |
|---------|--------|
| Suggested service name | `bingo-engine` (existing service may still be named historically) |
| **Root Directory** | `apps/engines/bingo` |
| Dockerfile | `Dockerfile` (relative to root directory) |
| Start | `node dist/index.js` |
| Health | `GET /health` (JSON `service: "game-engine"` unchanged) |

> If production was cut over in P4.2 to `apps/game-engine`, update Root Directory again to `apps/engines/bingo` on the **same** service when deploying this phase.

### Future (Backgammon)

| Setting | Planned value |
|---------|----------------|
| Service name | `backgammon-engine` |
| Root Directory | `apps/engines/backgammon` |
| Dockerfile | TBD when implementation lands |
| Isolation | Separate Railway service, env, Redis prefix, and DB role grants as needed |

### Pattern

```
Vercel: Next root (/)
Railway service A: apps/engines/bingo
Railway service B (future): apps/engines/backgammon
Shared: Supabase Postgres
Optional: separate Redis DBs/prefixes per engine
```

---

## 6. Bingo-specific inventory (short)

Full tables: [p4-3-engine-boundaries.md](./p4-3-engine-boundaries.md).

| Class | Keep in Bingo | Later shared pattern |
|-------|---------------|----------------------|
| **A** | Bitmask, card pool, draw_jobs, BingoCard UI, line/full house | — |
| **B** | — | Room lease, health/ready, JWT HTTP, Redis locks, settle call-site, `/v1` snapshots, Docker/Railway |

---

## 7. Dependency boundaries

Web ↔ Bingo engine TypeScript imports: **CLEAN** (HTTP + DB + events only).  
Details: [p4-3-engine-boundaries.md](./p4-3-engine-boundaries.md).

---

## 8. Exact references updated (ops)

| File | New path |
|------|----------|
| `.gitignore` | `apps/engines/bingo/{node_modules,dist,.env*}` |
| `tsconfig.json` | `exclude`: `apps/engines/bingo` |
| `scripts/sync-game-engine-env.ps1` | writes `apps/engines/bingo/.env` |
| `scripts/sync-supabase-develop-env.ps1` | `apps/engines/bingo/.env.develop.local` |
| `scripts/use-supabase-*.ps1` | messages/paths under `apps/engines/bingo` |
| `.env*.example` | comments |
| `apps/engines/bingo/README.md` | structure + `cd apps/engines/bingo` |
| Docs citing engine filesystem path | `apps/engines/bingo/…` |

Env **variable names** (`GAME_ENGINE_*`, etc.) intentionally unchanged.

---

## 9. Validation results

| Check | Result |
|-------|--------|
| `cd apps/engines/bingo && npm install` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** (`dist/index.js` present) |
| `npm test` | **PASS** (87 tests, 0 fail) |
| Root `npm install` | **PASS** |
| Root `npm run build` | **PASS** |
| Web ↔ engine TS imports | **CLEAN** (no violations) |
| Health contract | Unchanged (`service: "game-engine"` in `src/health/server.ts`) |
| Game logic / SQL / APIs / wallet | Not edited |

---

## 10. Rollback

```powershell
# Before commit: reverse rename
git mv apps/engines/bingo apps/game-engine
# restore path strings in .gitignore, tsconfig, scripts, docs
# remove apps/engines/backgammon if desired
```

Railway: set Root Directory back to previous value (`apps/game-engine` or `game-engine` matching the deployed SHA).

---

## 11. Future recommendations

1. Cut over Railway Root Directory to `apps/engines/bingo` (staging → prod).  
2. Keep Backgammon as README-only until product-ready.  
3. Introduce `packages/engine-*` only when a second engine shares real code.  
4. Add `engine_type` (or equivalent) on templates/rooms before routing web traffic to multiple engines.  
5. Do not rename finance RPCs for multi-engine until a real second ledger consumer exists.

---

## 12. Railway cutover reminder (not applied here)

After this code lands, update the **existing** Bingo Railway service Root Directory:

`apps/game-engine` → `apps/engines/bingo`

Do **not** create `backgammon-engine` until that package exists.
