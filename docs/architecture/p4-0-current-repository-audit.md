# P4.0 — Current Repository Audit

> **P4.2 path note:** After P4.2 the engine lives at `apps/engines/bingo/`. This P4.0 document is a **point-in-time** snapshot; bare `game-engine/` paths below describe the pre-move layout (unless the sentence already discusses the target `apps/engines/bingo/`).

> **Phase:** P4.0 Repository Architecture Audit  
> **Mode:** READ-ONLY (no moves, renames, code edits, deploy changes)  
> **Date:** 2026-08-03  
> **Repo:** `winway-dev` (`dingmoney-bingo` / DingMoney Bingo)

Companion docs:

- [p4-0-current-repository-map.md](./p4-0-current-repository-map.md)
- [p4-0-target-architecture.md](./p4-0-target-architecture.md)
- [p4-0-migration-roadmap.md](./p4-0-migration-roadmap.md)

---

## 1. Executive summary

The repository is a **multi-app monorepo without workspace tooling**.

| Runtime | Location | Deploy |
|---------|----------|--------|
| Next.js 14 (player + admin + agent + API) | repo root | **Vercel** (`dingmoney.org` / `admin.dingmoney.org`, staging `dev.*`) |
| Game Engine (Node 20 TS workers + HTTP) | `game-engine/` | **Railway** (Docker) |
| PostgreSQL + Auth + Realtime | Supabase | Supabase Cloud |
| Coordination cache / locks | Upstash Redis | Engine-primary |

There is **no** `pnpm-workspace`, Turbo, or Nx. Root `tsconfig.json` **excludes** `game-engine`. Shared contracts package `packages/game-contracts` is an empty placeholder (README only).

**Critical debt for later phases (not changed in P4.0):**

1. Intentional TS mirrors between Next `lib/` and `game-engine/src/` (live-room PG, gameroom, lobby, RNG).
2. Dual migration trees (`sql/migrations` canonical vs thin `supabase/migrations`).
3. Large root clutter (`.tmp-*`, build logs, ad-hoc SQL) — many **tracked in git**.
4. Split UI locations (`app/`, `components/`, `src/screens/`, route-group leftovers).

---

## 2. Root directory inventory

### 2.1 Top-level folders

| Folder | Role | Classification |
|--------|------|----------------|
| `app/` | Next.js App Router (pages, layouts, API routes) | **KEEP** — primary web app |
| `components/` | Shared React UI | **KEEP** |
| `contexts/` | Legacy `DingContext` only | **OBSOLETE island** — real SoT in `lib/contexts` |
| `lib/` | Next shared libs (auth, PG, Supabase, gameEngine client, hooks) | **KEEP** |
| `services/` | Browser/admin data services → Supabase / API clients | **KEEP** |
| `src/` | Screens, DTOs (`src/types`), assets, bingo-generator | **KEEP** (hybrid leftover) |
| `public/` | Static assets, PWA manifests, SW | **KEEP** |
| `game-engine/` | Standalone orchestration service | **KEEP** — second app |
| `packages/` | Intended shared packages; only stub `game-contracts` | **KEEP structure** |
| `sql/` | Canonical SQL migrations + functions + optimization | **KEEP** — infra |
| `supabase/` | CLI `config.toml` + 3 migrations + `.temp` | **KEEP** (clarify role) |
| `scripts/` | Ops / env switch / admin bootstrap / cron SQL | **KEEP** — tools |
| `services/dev-panel/` | Dev-panel service helpers | **KEEP** (under services) |
| `docs/` | Architecture, audits, runbooks, roadmap | **KEEP** |
| `notebooks/` | Placeholder notebook only | **OBSOLETE / empty** |
| `tmp/` | Local temp notes | **TEMPORARY** |
| `.next/` | Next build output | **GENERATED** (gitignored) |
| `node_modules/` | Root deps | **GENERATED** (gitignored) |
| `.cursor/` | Cursor rules + local debug log | **TOOLING** |
| `.git/` | VCS | **IGNORE** |
| `.supabase-config-push/` | Isolated tree for Supabase config push | **TEMPORARY tooling** |

### 2.2 Top-level config / project files

| File | Purpose |
|------|---------|
| `package.json` / `package-lock.json` | Next.js app (`dingmoney-bingo`) |
| `tsconfig.json` | Next TS; excludes `game-engine` |
| `next.config.mjs` | Empty Next config |
| `next-env.d.ts` | Next generated types |
| `middleware.ts` | Host split + Supabase session |
| `postcss.config.mjs` / `tailwind.config.ts` | CSS pipeline |
| `.gitignore` | Ignores `.env*.local`, `.next`, `node_modules`, `*.tsbuildinfo`; **does not ignore `.tmp*`** |
| `winway.code-workspace` | Multi-root editor (repo + external `Users/Pc/supabase`) |
| `.env.local` / examples | Local secrets / templates (see §7) |

### 2.3 Root loose / obsolete files

| Pattern | Examples | Classification |
|---------|----------|----------------|
| MCP/migration scratch | `.tmp-*` (24 files, **git-tracked**) | **DELETE** (+ gitignore) |
| Build noise | `build.log`, `build.err`, `build.debug.log` (**tracked**) | **DELETE** |
| Ad-hoc discovery SQL | `find_tickets_*.sql`, `get_all_tables.sql`, `list_all_tables.sql` | **MOVE** → tools/archive or **DELETE** |
| Legacy schema docs | `supabase-schema.sql`, `supabase-migration-add-won-at.sql`, `supabase-setup.md` | **MOVE** → docs archive (README still mentions schema) |
| Root planning MD | `ARCHITECTURE_PLAN.md`, `SETUP_GUIDE.md`, `DING_SYSTEM.md`, `FRONTEND_PAGES_STATUS.md`, `LEADERBOARD_SETUP.md`, `draw_jobs_occurrences.md`, `fn_manage_waiting_rooms_references.md` | **MOVE** → `docs/` (archive or consolidate) |
| TS incremental | `tsconfig.tsbuildinfo` | **IGNORE** (gitignored pattern) |

---

## 3. Applications

### 3.1 Next.js web app (primary)

| Field | Value |
|-------|--------|
| **Name** | `dingmoney-bingo` |
| **Entrypoint** | `middleware.ts` → `app/layout.tsx` → `app/page.tsx` |
| **Runtime** | Node (Vercel serverless + Edge middleware) |
| **package.json** | `/package.json` |
| **Build** | `npm run build` → `next build` |
| **Start** | `npm run start` → `next start` |
| **Dev** | `npm run dev` → `next dev` |
| **Deploy target** | **Vercel** — projects `winway` (prod) / `winway-dev` (staging) |
| **Hosts** | `dingmoney.org` (player), `admin.dingmoney.org` (admin/dev-panel); staging `dev.dingmoney.org` / `admin.dev.dingmoney.org` |
| **Surfaces** | Player (`app/player/*`), Admin (`app/admin/*`), Agent (`app/agent/*`), Dev Panel (`app/dev-panel/*`), API (`app/api/*`) |

Admin is **not** a separate Vercel project: same Next build, host routing in `middleware.ts`.

### 3.2 Game Engine

| Field | Value |
|-------|--------|
| **Name** | `@dingmoney/game-engine` |
| **Entrypoint** | `game-engine/src/index.ts` → compiled `dist/index.js` |
| **Runtime** | Node ≥ 20 (long-lived process) |
| **package.json** | `game-engine/package.json` |
| **Build** | `npm run build` → `tsc` |
| **Start** | `npm start` → `node dist/index.js` |
| **Dev** | `npm run dev` → `tsx watch src/index.ts` |
| **Deploy target** | **Railway** Docker (`game-engine/Dockerfile`), working dir = `game-engine/` |
| **HTTP** | Port 8080: `/health`, `/ready`, `/v1/lobby`, `/v1/gameroom`, `/v1/live-room`, `/v1/rooms/join`, commands API |
| **Workers (roles)** | `scheduler`, `draw-processor`, `room-loop`, `tournament-orchestrator`, `dev-player-scheduler`, `dev-player-processor` |
| **Gate** | `SCHEDULER_ENABLED` (default off locally); `GAME_RUNTIME=legacy_db\|hybrid\|engine` |

`game-engine/src/runtime.ts` is **not** a process entry — helpers for runtime mode.

### 3.3 Admin / Agent / Dev Panel

These are **route surfaces inside the Next app**, not separate packages:

- Admin UI + `/api/admin/*`
- Agent UI
- Dev Panel UI + `/api/dev-panel/*`

Deployed with the same Vercel build; admin/dev-panel redirected to admin host on main domain.

### 3.4 CLI / workers / notebooks

| Item | Status |
|------|--------|
| Root `scripts/*` | Ops tooling (env sync, admin SQL, connection test) — **not** a product app |
| `game-engine/scripts/*` | Load tests / multi-replica harness / unit runner |
| `notebooks/placeholder.ipynb` | Empty — not an app |
| Edge Functions | No source under `supabase/functions/`; remote stubs superseded by Railway engine |

---

## 4. Dependencies

### 4.1 Logical dependency graph

```
Browser (PWA)
    │
    ▼
Web (Next.js / Vercel)
    │  app → components → services → lib
    │  app → src/screens, src/types
    │
    ├── HTTP (flagged) ──► Game Engine (Railway)
    │                         │
    │                         ├── PostgreSQL (service_role / DATABASE_URL)
    │                         ├── Supabase Admin SDK
    │                         └── Upstash Redis (locks / coordination)
    │
    ├── Supabase Auth + Realtime + Anon SDK
    └── Direct PostgreSQL (DATABASE_URL via lib/pg.ts)
              │
              ▼
         Supabase Postgres (source of truth)
```

Simplified “requested” chain:

```
Web → Shared (conceptual) → Engine → Supabase/Postgres → Railway/Vercel
```

**Today Shared is conceptual only** — no published `packages/*` modules. Duplication fills the gap.

### 4.2 Package-level boundaries (actual)

| From → To | Allowed today? | Notes |
|-----------|----------------|-------|
| Next → `apps/engines/bingo/` source | **Forbidden / unused** | No imports; HTTP client only |
| `game-engine` → Next (`app/`, `lib/`, …) | **Forbidden / unused** | Clean isolation |
| `app` → `lib`, `services`, `components`, `src` | Yes | Primary graph |
| `services` → `lib`, `src/types` | Yes | |
| `components` → `lib`, `services`, `src` | Yes | |
| `lib` → `services` / `components` | Soft smell | teardown, TourContext → TourOverlay |

### 4.3 Forbidden / risky cross-imports

1. **No TS cross-import Next ↔ Engine** — good.
2. **Client → server-only** (`lib/pg`, `lib/supabaseServer`) — not found in `components/` / `src/` (good).
3. **Layer inversion:** `lib/contexts/TourContext` → `components`; `lib` → `services` for cache teardown / types.
4. **Circular risk:** mild `components → lib → components` via Tour; `services ↔ lib` soft edges.

### 4.4 Circular dependencies

No hard package cycles between apps. Within Next, soft cycles via Tour / cache teardown — not module graph cycles that break builds.

### 4.5 Duplicated utilities / types

| Domain | Next | Engine | Risk |
|--------|------|--------|------|
| PG pool | `lib/pg.ts` | `game-engine/src/db/pg.ts` | Drift in pool options |
| Live-room PG snapshot | `lib/liveRoomSnapshotPg.ts` | `http/live-room-snapshot-pg.ts` | Documented mirror — **high drift risk** |
| Gameroom / lobby views | `app/api/player/*` + helpers | `http/*-view.ts`, `lobby-snapshot.ts` | Parity maintenance |
| Provably-fair RNG | `lib/provablyFair*.ts` | `core/rng.ts` | Fairness mismatch risk |
| Finance pure logic | SQL RPCs + admin APIs | `core/wallet.ts`, `commission.ts`, `prizeSplit.ts` | Intentional port |
| Bingo UI vs engine | `lib/bingo-logic.ts`, `src/lib/bingo-generator.ts` | `core/bitmask/*` | Different roles; rule drift possible |
| DTOs | `src/types/*` | Engine local types | No shared package yet |

`packages/game-contracts` is the intended home — **empty**.

---

## 5. Shared code candidates (`packages/shared-*`)

Do **not** move in P4.0. Candidates for later extraction:

| Candidate package | Current homes | Contents |
|-------------------|---------------|----------|
| `packages/shared-types` / `game-contracts` | `src/types/*`, engine DTOs, API response shapes | Room, draw, lobby, live-room, tournament DTOs |
| `packages/shared-db` | `lib/pg.ts`, engine `db/pg.ts` | Pool factory, query helpers (server-only) |
| `packages/shared-auth` | `lib/auth/*`, `lib/supabase*`, engine `http/auth.ts` | JWT verification contracts, role helpers (split client/server carefully) |
| `packages/shared-events` | Hard-exit event name, referral events | Stable event string constants |
| `packages/shared-constants` | Feature flags names, host defaults, Redis key prefixes (engine-only subset) | Env key names, status enums |
| `packages/shared-utils` | `draw-order`, provably-fair, bingo-generator | Pure functions with no Next/React deps |
| `packages/shared-snapshots` | live-room / gameroom / lobby PG loaders | Highest-value de-dupe target |

**Must stay app-local:** React contexts, hooks, CSS modules, Next middleware, Engine workers.

---

## 6. Infrastructure inventory

| Area | Current location | Recommended permanent home |
|------|------------------|----------------------------|
| SQL migrations (canonical) | `sql/migrations/` (~197 files) | `infrastructure/sql/migrations/` |
| SQL functions (standalone) | `sql/functions/` | `infrastructure/sql/functions/` |
| SQL optimization notes | `sql/optimization/` | `infrastructure/sql/optimization/` |
| Engine-side migration notes | `sql/migrations/_game_engine/` | `infrastructure/sql/migrations/_game_engine/` |
| Supabase CLI config | `supabase/config.toml` | `infrastructure/supabase/` |
| Partial Supabase migrations | `supabase/migrations/` (3) | Merge policy into canonical SQL or document as CLI-only |
| Config-push staging | `.supabase-config-push/` | Remove after documenting CLI workflow, or `tools/supabase-config-push/` |
| Railway Dockerfile | `game-engine/Dockerfile` | Stay with `apps/engines/bingo/` |
| Multi-replica compose | `game-engine/docker-compose.multi-replica.yml` | Stay with engine or `infrastructure/docker/` |
| Ops scripts | `scripts/` | `tools/scripts/` |
| Cron SQL (legacy/pg_cron) | `scripts/game-engine-cron-*.sql` | `infrastructure/sql/cron/` or archive |
| Deploy docs | `docs/audits/`, `docs/runbooks/` | Stay under `docs/` |
| PWA / public assets | `public/` | Stay with `apps/web/public` |

---

## 7. Environment inventory

### 7.1 Files

| File | Consumer | Env |
|------|----------|-----|
| `.env.local` | Next (local) | development (gitignored) |
| `.env.local.example` | Next template (prod-shaped) | documentation |
| `.env.develop.local.example` | Next staging local template | develop/staging |
| `game-engine/.env` | Engine local (gitignored) | development |
| `game-engine/.env.example` | Engine template | documentation |
| `game-engine/.env.develop.local.example` | Engine staging local | develop |

### 7.2 Who consumes what

| Variable class | Next (Vercel) | Engine (Railway) |
|----------------|---------------|------------------|
| `NEXT_PUBLIC_SUPABASE_*` | Yes | No (uses `SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (API routes) | Yes |
| `DATABASE_URL` | Yes (PG snapshots) | Yes (parity) |
| `MAIN_APP_HOST` / `ADMIN_APP_HOST` | Yes | No |
| `NEXT_PUBLIC_USE_GAME_ENGINE` / `NEXT_PUBLIC_GAME_ENGINE_URL` | Yes | No |
| `GAME_ENGINE_ROLES`, `SCHEDULER_ENABLED`, `GAME_RUNTIME` | No | Yes |
| `GAME_ENGINE_API`, `GAME_ENGINE_CORS_ORIGINS` | Documented for engine | Yes (code/docs; incomplete in `.env.example`) |
| Redis `REDIS_URL` / Upstash | Optional/unused for Next lobby | Engine coordination |

### 7.3 Production vs development

| Surface | Production | Development / staging |
|---------|------------|------------------------|
| Vercel | `winway` → `dingmoney.org` | `winway-dev` → `dev.dingmoney.org` |
| Railway | `winway-production.up.railway.app` | `winway-dev-production.up.railway.app` |
| Supabase | main project | develop branch (`ovclbgxtpxyzlcmwbviw` in examples) |
| Local | `.env.local` + engine `.env` with `SCHEDULER_ENABLED=false` | `scripts/use-supabase-develop.ps1` |

---

## 8. Deployment

### 8.1 Deployment graph

```
                    ┌─────────────────────┐
                    │  Supabase Postgres  │
                    │  Auth / Realtime    │
                    └──────────▲──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
┌─────────┴─────────┐  ┌───────┴────────┐  ┌───────┴────────┐
│ Vercel: Next.js   │  │ Railway: Engine│  │ Upstash Redis  │
│ Build root: /     │  │ Build root:    │  │ (engine)       │
│ next build/start  │  │ game-engine/   │  └────────────────┘
│ Hosts:            │  │ Docker node 20 │
│  dingmoney.org    │  │ CMD dist/index │
│  admin.dingmoney  │  │ Port 8080      │
└─────────┬─────────┘  └───────▲────────┘
          │                    │
          └── HTTP /v1/* ──────┘
             (feature-flagged)
```

### 8.2 Build roots / working directories

| Deploy | Build root | Working directory | Start |
|--------|------------|-------------------|-------|
| Vercel web | repo root | `/` | `next start` (platform) |
| Railway engine | `game-engine/` | Dockerfile `/app` | `node dist/index.js` |

No `railway.toml` / `vercel.json` in repo — platform dashboard config.

---

## 9. Temporary artifacts classification

| Artifact | Class | Action |
|----------|-------|--------|
| `.tmp-*` (root, tracked) | DELETE | Remove from git; add `.tmp*` to `.gitignore` |
| `build.log` / `build.err` / `build.debug.log` | DELETE | Remove from git |
| `tmp/` | DELETE or IGNORE | Don't commit; optional gitignore `tmp/` |
| `.next/`, `node_modules/`, `game-engine/node_modules/`, `dist/` | IGNORE | Already gitignored / build outputs |
| `tsconfig.tsbuildinfo` | IGNORE | Pattern gitignored |
| `.supabase-config-push/` | MOVE or KEEP | Document or relocate under `tools/` |
| `supabase/.temp`, nested `supabase/supabase/.temp` | IGNORE | CLI cache |
| `notebooks/placeholder.ipynb` | DELETE or KEEP empty | No active use |
| Root ad-hoc `*.sql` discovery | MOVE | `tools/adhoc/` or delete |
| Root planning `*.md` | MOVE | Under `docs/archive/` |
| `packages/game-contracts` README-only | KEEP | Placeholder for shared types |

---

## 10. Risk analysis (current state)

| Risk | Severity | Notes |
|------|----------|-------|
| Live-room / gameroom mirror drift | **High** | Two code paths; financial/game correctness depends on parity |
| Tracked `.tmp*` / build logs | Medium | Noise, possible secret leakage in scratch payloads |
| Dual SQL migration locations | Medium | Operator confusion; `sql/migrations` is SoT |
| No workspace tooling | Medium | Path moves will break Vercel/Railway if not sequenced |
| Soft layer inversions in Next | Low | Tour / teardown |
| Empty `game-contracts` | Medium | Encourages continued copy-paste |
| Root MD / SQL sprawl | Low | Onboarding friction |

---

## 11. Audit constraints confirmation

This phase did **not**:

- move / rename files  
- edit application code or configs  
- edit `package.json`  
- modify Railway / Vercel / Supabase  
- commit or push  

Deliverables are documentation only under `docs/architecture/`.

---

## 12. Related existing docs

- `docs/roadmap/GAME_ENGINE_MIGRATION.md`
- `docs/architecture/API_MIGRATION_*`
- `docs/audits/deployment-runtime-state-audit.md` (if present)
- `docs/architecture-current.md` (lobby/gameroom behavior)
- Root `ARCHITECTURE_PLAN.md` (feature-folder aspiration; partially outdated)
