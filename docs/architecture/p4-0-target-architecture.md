# P4.0 — Target Architecture

> **P4.2 path note:** After P4.2 the engine lives at `apps/engines/bingo/`. This P4.0 document is a **point-in-time** snapshot; bare `game-engine/` paths below describe the pre-move layout (unless the sentence already discusses the target `apps/engines/bingo/`).

> Proposed **final repository structure** after folder migration.  
> **No files are moved in P4.0.** This document is the destination map.  
> Phases: [p4-0-migration-roadmap.md](./p4-0-migration-roadmap.md)

Principles:

1. **Two apps, clear packages, clear infra** — no behavior change during moves.
2. **PostgreSQL remains source of truth**; Engine remains orchestration; Next remains UI + BFF.
3. **Shared code only when pure / contract-level** — no React in shared packages used by Engine.
4. **Deploy roots stay stable** until a dedicated phase updates Vercel/Railway settings.

---

## 1. Target tree

```
winway-dev/
├── apps/
│   ├── web/                              # ← current Next.js root app
│   │   ├── app/
│   │   ├── components/
│   │   ├── contexts/                     # remove after DingContext retirement
│   │   ├── lib/                          # Next-specific libs (thin)
│   │   ├── services/
│   │   ├── src/                          # screens/types/assets (or flatten later)
│   │   ├── public/
│   │   ├── middleware.ts
│   │   ├── next.config.mjs
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.mjs
│   │   └── .env*.example                 # web-local examples
│   │
│   └── game-engine/                      # ← current game-engine/
│       ├── src/
│       ├── scripts/
│       ├── Dockerfile
│       ├── docker-compose.multi-replica.yml
│       ├── package.json
│       ├── tsconfig.json
│       └── .env*.example
│
├── packages/
│   ├── shared-types/                     # ← expand game-contracts
│   │   ├── package.json
│   │   └── src/                          # Room, Draw, Lobby, LiveRoom DTOs
│   ├── shared-utils/                     # pure: draw-order, provably-fair, bingo-gen
│   ├── shared-constants/                 # enums, event names, status strings
│   ├── shared-db/                        # optional: pg pool factory (server-only)
│   └── shared-snapshots/                 # optional: live-room/gameroom PG loaders
│
├── infrastructure/
│   ├── sql/
│   │   ├── migrations/                   # ← sql/migrations
│   │   ├── functions/                    # ← sql/functions
│   │   ├── optimization/                 # ← sql/optimization
│   │   └── cron/                         # ← scripts/game-engine-cron-*.sql (archive)
│   ├── supabase/
│   │   ├── config.toml                   # ← supabase/config.toml
│   │   └── migrations/                   # policy: sync or deprecate vs sql/
│   └── docker/                           # optional shared compose overrides
│
├── tools/
│   ├── scripts/                          # ← scripts/ (ops, env switch, admin SQL)
│   ├── adhoc/                            # ← root find_tickets_*.sql, discovery SQL
│   └── supabase-config-push/             # ← .supabase-config-push (or delete)
│
├── docs/                                 # stays (plus archive of root MDs)
│   ├── architecture/
│   ├── audits/
│   ├── roadmap/
│   ├── runbooks/
│   └── archive/                          # ← root ARCHITECTURE_PLAN, SETUP_GUIDE, …
│
├── .cursor/
├── .gitignore
├── package.json                          # optional root workspace orchestrator
├── pnpm-workspace.yaml / npm workspaces  # introduce in a dedicated phase
├── README.md
└── winway.code-workspace                 # update folder paths
```

---

## 2. Where every current folder moves

| Current path | Target path | Notes |
|--------------|-------------|-------|
| `app/` | `apps/web/app/` | Unchanged internal structure initially |
| `components/` | `apps/web/components/` | |
| `contexts/` | `apps/web/contexts/` then delete when unused | Legacy DingContext |
| `lib/` | `apps/web/lib/` | Extract pure pieces → `packages/*` later |
| `services/` | `apps/web/services/` | |
| `src/` | `apps/web/src/` | Optional later: `screens` → `components/screens` |
| `public/` | `apps/web/public/` | |
| `middleware.ts` | `apps/web/middleware.ts` | |
| `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs` | `apps/web/` | |
| Root `package.json` / lockfile | `apps/web/package.json` | Root may become workspace |
| Root `tsconfig.json` | `apps/web/tsconfig.json` | |
| Root `.env*.example` | `apps/web/` | |
| `apps/engines/bingo/` | `apps/engines/bingo/` | Dockerfile build context updates |
| `packages/game-contracts/` | `packages/shared-types/` (rename/expand) | Keep README intent |
| `sql/` | `infrastructure/sql/` | |
| `supabase/` | `infrastructure/supabase/` | Strip `.temp` from VCS |
| `.supabase-config-push/` | `tools/supabase-config-push/` or delete | |
| `scripts/` | `tools/scripts/` | |
| Root ad-hoc `*.sql` | `tools/adhoc/` or delete | |
| Root planning `*.md` | `docs/archive/` | |
| `docs/` | `docs/` | Stays |
| `notebooks/` | delete or `tools/notebooks/` | Empty placeholder |
| `tmp/`, `.tmp-*`, `build.*` | **delete** | Never relocate into apps |
| `.next/`, `node_modules/` | regenerate under new roots | |
| `.cursor/` | `.cursor/` | Stays at root |
| `winway.code-workspace` | update paths | External supabase path optional |

---

## 3. Target applications

### 3.1 `apps/web` — Next.js

| Field | Target |
|-------|--------|
| Entrypoint | `apps/web/middleware.ts`, `apps/web/app/layout.tsx` |
| Runtime | Node / Vercel |
| package.json | `apps/web/package.json` |
| Build / start | `next build` / `next start` |
| Deploy | Vercel — **Root Directory** set to `apps/web` (phase-gated) |

Surfaces remain: player, admin, agent, dev-panel, API BFF.

### 3.2 `apps/engines/bingo` — Engine

| Field | Target |
|-------|--------|
| Entrypoint | `apps/engines/bingo/src/index.ts` |
| Runtime | Node 20 |
| package.json | `apps/engines/bingo/package.json` |
| Build / start | `tsc` → `node dist/index.js` |
| Deploy | Railway — root/watch path `apps/engines/bingo` (phase-gated) |

### 3.3 Shared packages

| Package | Consumers | Constraint |
|---------|-----------|------------|
| `shared-types` | web + engine | No Node/Next imports |
| `shared-utils` | web + engine | Pure TS only |
| `shared-constants` | web + engine | No secrets |
| `shared-db` | web API routes + engine | Server-only; never import from client components |
| `shared-snapshots` | web API + engine HTTP | Highest de-dupe value; extract after types stabilize |

---

## 4. Target dependency graph

```
apps/web
   │
   ├──► packages/shared-types
   ├──► packages/shared-utils
   ├──► packages/shared-constants
   ├──► packages/shared-db          (server routes only)
   └──► packages/shared-snapshots   (server routes only)
              ▲
apps/engines/bingo ──────────────────┘

Both apps ──► Supabase Postgres
Engine ─────► Upstash Redis
Web ────────► Engine HTTP (/v1/*)
```

**Forbidden after migration:**

- `apps/web` importing `apps/engines/bingo` source
- `apps/engines/bingo` importing `apps/web` source
- Client components importing `shared-db` / `shared-snapshots`
- Packages importing either app

---

## 5. Target deployment graph

```
Vercel (Root Directory: apps/web)
   │
   │  NEXT_PUBLIC_GAME_ENGINE_URL
   ▼
Railway (Root Directory: apps/engines/bingo)
   │
   ├── DATABASE_URL / SUPABASE_*
   └── REDIS_URL
          │
          ▼
    Supabase Postgres

infrastructure/sql/migrations  = human + CI apply path (unchanged semantics)
infrastructure/supabase        = CLI config / optional linked project
```

Hosts unchanged:

- `dingmoney.org` / `admin.dingmoney.org`
- staging `dev.*` / `admin.dev.*`

---

## 6. Infrastructure permanent homes

| Concern | Permanent location |
|---------|-------------------|
| Migrations | `infrastructure/sql/migrations` |
| One-off SQL helpers | `infrastructure/sql/functions` |
| Cron archive | `infrastructure/sql/cron` |
| Supabase CLI | `infrastructure/supabase` |
| Operator scripts | `tools/scripts` |
| Ad-hoc discovery | `tools/adhoc` (or delete) |
| Deploy runbooks | `docs/runbooks` |
| Architecture | `docs/architecture` |

---

## 7. Environment layout (target)

```
apps/web/.env.local.example
apps/web/.env.develop.local.example
apps/engines/bingo/.env.example
apps/engines/bingo/.env.develop.local.example

# Platform secrets remain in Vercel / Railway dashboards — not in git
```

Root may keep a short `README` pointer; no production secrets at repo root.

---

## 8. Target tree vs current (mental model)

```
TODAY                              TARGET
─────                              ──────
/ (Next + clutter)          →      apps/web/
game-engine/                →      apps/engines/bingo/
packages/game-contracts/    →      packages/shared-types/ (+ siblings)
sql/ + supabase/            →      infrastructure/
scripts/ + root junk        →      tools/ (+ delete temps)
docs/                       →      docs/ (+ archive)
```

---

## 9. Non-goals of the folder migration

- Changing game rules, RPC ACLs, or wallet logic
- Merging admin into a separate deployable
- Replacing Supabase Auth
- Introducing microservices beyond existing Engine
- Rewriting `src/screens` into App Router in the same phase as moves

Behavior-preserving moves only; refactors of internals are separate initiatives.
