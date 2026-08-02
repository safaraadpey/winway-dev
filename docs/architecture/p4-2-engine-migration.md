# P4.2 — Move Game Engine to `apps/game-engine`

> **Phase:** P4.2 Engine path migration  
> **Date:** 2026-08-03  
> **Status:** Local move + validation complete — **ready for Railway Root Directory cutover**  
> **Not done in this phase:** commit, push, Railway dashboard change, deploy, Vercel changes

Related: [p4-0-migration-roadmap.md](./p4-0-migration-roadmap.md) · [p4-1-root-cleanup.md](./p4-1-root-cleanup.md)

---

## Summary

| Item | Result |
|------|--------|
| Move | `git mv game-engine` → `apps/game-engine` (**195 tracked renames**) |
| Engine internals | Unchanged (package.json, lockfile, tsconfig, Dockerfile, src tree, env names, roles, `/health`) |
| Next.js / Vercel | **Unchanged** — still builds from repository root |
| npm workspaces / shared packages | **Not introduced** |
| SQL / Supabase | **Not changed** |
| Railway | **Not applied** — checklist prepared below |

---

## Exact files moved

Entire former `game-engine/` tree (Git history preserved via `git mv`):

```
game-engine/  →  apps/game-engine/
```

Includes (non-exhaustive):

- `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`
- `.env.example`, `.env.develop.local.example`
- `Dockerfile`, `docker-compose.multi-replica.yml`
- `README.md`
- `src/**` (index, workers, http, domain, core, …)
- `scripts/**` (tests, load-test)
- `load-test-reports/**`

Old path `game-engine/` no longer exists on disk.

---

## Exact references changed

### Corrected (must-follow path)

| File | Change |
|------|--------|
| `.gitignore` | `game-engine/{node_modules,dist,.env*}` → `apps/game-engine/…` |
| `tsconfig.json` | `exclude`: `game-engine` → `apps/game-engine` |
| `scripts/sync-game-engine-env.ps1` | Writes `apps/game-engine/.env` |
| `scripts/sync-supabase-develop-env.ps1` | Writes `apps/game-engine/.env.develop.local`; `cd apps/game-engine` |
| `scripts/use-supabase-develop.ps1` | Copies engine develop env under `apps/game-engine/` |
| `scripts/use-supabase-main.ps1` | Message path updated |
| `apps/game-engine/README.md` | Tree path, `cd apps/game-engine`, relative links `../../docs`, `../../scripts` |
| `.env.local.example` | Comment → `apps/game-engine/.env.example` |
| `.env.develop.local.example` | Comment path updated |
| `lib/provablyFairDrawSpec.ts` | Comment path |
| `lib/provablyFairVerify.ts` | Comment path |
| `docs/migration/local-game-engine-rollout.md` | Operational `cd` / script relative paths |
| `docs/migration/*`, `docs/roadmap/GAME_ENGINE_MIGRATION.md`, `docs/system-map/*`, `docs/security/*`, `docs/architecture/API_*`, audits | File-path citations → `apps/game-engine/…` |
| `docs/architecture/p4-0-*.md` | Banner added: P4.0 remains a pre-move snapshot where bare `game-engine/` appears |

### Not present / unchanged

| Item | Notes |
|------|--------|
| `railway.toml` / `railway.json` | **None in repo** — config is dashboard-only |
| `.github` CI workflows | **None** referencing `game-engine/` |
| Root `package.json` | **Unchanged** (no workspaces) |
| Engine `package.json` / Dockerfile / `CMD` | **Unchanged** |
| Vercel config | **None / unchanged** |

---

## Remaining `game-engine` occurrence classification

| Kind | Examples | Classification |
|------|----------|----------------|
| New filesystem path | `apps/game-engine/…` | **corrected** |
| Package name | `@dingmoney/game-engine` | **intentional** |
| Redis key prefix | `ding:game-engine` | **intentional** |
| Health `service` string | `"game-engine"` | **intentional** |
| Env vars | `GAME_ENGINE_*`, `NEXT_PUBLIC_GAME_ENGINE_*` | **intentional** |
| Ops SQL filenames | `scripts/game-engine-cron-*.sql` | **intentional** |
| Doc filenames | `game-engine-reality.md` | **intentional** |
| SQL migration comments | e.g. `sql/.../load_test_seed...sql` still says `game-engine/scripts/…` | **historical / intentional** (SQL not edited per phase boundary) |
| P4.0 snapshot docs | Bare `game-engine/` under P4.2 path note | **historical documentation** |
| `cd game-engine` in scripts/README | None remaining (updated) | **corrected** |

No **stale/blocking** operational script or build path remains at the old root `game-engine/`.

---

## Preserved engine behavior

| Concern | Status |
|---------|--------|
| `package.json` name/scripts/deps | Same |
| Lockfile | Same `package-lock.json` (moved) |
| `tsconfig.json` | Same |
| `Dockerfile` multi-stage + `EXPOSE 8080` + `CMD ["node","dist/index.js"]` | Same (build context = service root) |
| Source structure | Same under `apps/game-engine/src` |
| Env variable **names** | Same |
| `GET /health`, `GET /ready`, `/v1/*` | Same |
| `GAME_ENGINE_ROLES` / `SCHEDULER_ENABLED` / `GAME_RUNTIME` | Same |

---

## Railway dashboard checklist (DO NOT APPLY YET)

Prepare these changes in Railway **after** the git commit/push of this move (staging first).

| Setting | Old value | New value |
|---------|-----------|-----------|
| **Root Directory** | `game-engine` (or empty/`/` if previously set that way — confirm in UI) | `apps/game-engine` |
| **Dockerfile path** | `Dockerfile` (relative to root directory) | `Dockerfile` (still relative to new root — **no filename change**) |
| **Config file** | none in repo (`railway.toml` / `railway.json` absent) | still none |
| **Build command** | Dockerfile `RUN npm ci` + `npm run build` (or Railway Docker builder default) | **unchanged** |
| **Start / start command** | `node dist/index.js` (`CMD` in Dockerfile) | **unchanged** |
| **Watch paths / monorepo** | N/A or old folder | Ensure watch/build root is `apps/game-engine` |
| **Env variables** | existing `SUPABASE_*`, `DATABASE_URL`, `GAME_ENGINE_*`, Redis, etc. | **do not rename or change values** |
| **Public URL / custom domain** | existing `*.up.railway.app` | unchanged |
| **Replicas / roles** | existing | unchanged for this cutover |

### Suggested cutover order

1. Merge/push code with `apps/game-engine`.
2. Staging Railway: set Root Directory → `apps/game-engine` → redeploy.
3. Confirm `GET /health` and `GET /ready`.
4. Smoke lobby / live-room / draw tick as appropriate for env.
5. Production Railway: same Root Directory change → redeploy.
6. Keep previous deployment available for instant rollback if platform allows.

### Rollback (Railway)

1. Set Root Directory back to `game-engine` **only if** that path still exists on the deployed git SHA (i.e. rollback the git deploy to pre-move commit **or** reverse the move).
2. Preferred: redeploy previous successful deployment / previous git SHA where `game-engine/` still existed.
3. Env vars need no rollback.

---

## Vercel — no change required

| Setting | Required action |
|---------|-----------------|
| Root Directory | **Stay repository root** (`/`) |
| Build command | Still `next build` via root `package.json` |
| Output / framework | Unchanged |
| Env vars | Unchanged |
| Paths under `app/`, `lib/`, `middleware.ts` | Unmoved |

**Explicit statement:** Vercel needs **no** configuration or path change in P4.2. Next.js continues to build from the repository root.

---

## Validation results

| Check | Result |
|-------|--------|
| `cd apps/game-engine && npm install` | **PASS** (exit 0) |
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run build` | **PASS** (exit 0); `dist/index.js` present |
| `npm test` | **PASS** — 87 tests, 0 fail |
| Start command | Confirmed `"start": "node dist/index.js"` |
| Docker build (`docker build -t … ./apps/game-engine`) | **NOT RUN** — Docker Desktop engine pipe unavailable (`dockerDesktopLinuxEngine` not running). Dockerfile inspected: self-contained; context must be `apps/game-engine` |
| Next imports of engine source | **None** (no `from '…game-engine…'`) |
| Root `npm install` | **PASS** (exit 0) |
| Root `npm run build` | **PASS** (exit 0) |

### Local commands (post-move)

```powershell
# From repo root — sync engine .env then run engine
.\scripts\sync-game-engine-env.ps1
cd apps/game-engine
npm install
npm run typecheck
npm run build
npm start   # node dist/index.js

# Next (from repo root — unchanged)
cd <repo-root>
npm install
npm run build
```

### Git snapshot (local, uncommitted)

- `git status`: includes `R game-engine/… -> apps/game-engine/…` renames plus prior P4.1 hygiene and unrelated WIP
- `git diff --stat`: large; includes renames + doc/script path updates (and earlier P4.1 deletions if still uncommitted)

---

## Rollback steps (repo)

Before commit:

```powershell
git mv apps/game-engine game-engine
# revert path edits in .gitignore, tsconfig.json, scripts/*.ps1, docs, etc.
```

After commit (future):

```powershell
git revert <p4.2-commit>
# or redeploy previous SHA on Railway + restore Root Directory to game-engine for that SHA
```

---

## Out of scope (confirmed not done)

- [ ] Commit / push  
- [ ] Railway Root Directory change  
- [ ] Railway / Vercel deploy  
- [ ] Moving Next.js to `apps/web`  
- [ ] npm workspaces  
- [ ] `packages/shared-*` extraction  
- [ ] Engine business-logic refactors  
- [ ] SQL / Supabase edits  
- [ ] Env **value** changes  

---

## Cutover readiness

Local filesystem and operational references point at `apps/game-engine`. Engine build/typecheck/tests and root Next build pass. Railway dashboard Root Directory update is the remaining production cutover step (staging first).
