# P4.0 — Migration Roadmap

> **P4.2 path note:** After P4.2 the engine lives at `apps/game-engine/`. This P4.0 document is a **point-in-time** snapshot; bare `game-engine/` paths below describe the pre-move layout (unless the sentence already discusses the target `apps/game-engine/`).

> Phase-by-phase plan to reach [p4-0-target-architecture.md](./p4-0-target-architecture.md).  
> **Every phase must preserve application behavior.**  
> P4.0 itself is documentation only (this set of files).

Related:

- [p4-0-current-repository-audit.md](./p4-0-current-repository-audit.md)
- [p4-0-current-repository-map.md](./p4-0-current-repository-map.md)

---

## Roadmap overview

| Phase | Name | Behavior change? | Deploy config change? |
|-------|------|------------------|------------------------|
| **P4.0** | Repository audit (docs) | No | No |
| **P4.1** | Hygiene — delete temps, gitignore, archive root junk | No | No |
| **P4.2** | Introduce workspace scaffolding (no moves) | No | No |
| **P4.3** | Move `game-engine` → `game-engine` | No | **Yes** (Railway root) |
| **P4.4** | Move Next app → `apps/web` | No | **Yes** (Vercel root) |
| **P4.5** | Move SQL + Supabase → `infrastructure/` | No | Docs/CI paths only |
| **P4.6** | Move scripts → `tools/`; finish archive | No | Script path updates |
| **P4.7** | Extract `packages/shared-*` (contracts first) | No* | Optional package wiring |
| **P4.8** | De-dupe snapshots / RNG into packages | No* | No |

\*Logic must remain byte-equivalent or covered by parity tests; no intentional product changes.

---

## P4.0 — Repository audit (COMPLETE when docs land)

| | |
|--|--|
| **Objective** | Freeze current map; define target; sequence moves |
| **Folders affected** | `docs/architecture/p4-0-*.md` only |
| **Risk** | None |
| **Rollback** | Delete the four docs |
| **Validation** | Docs exist; no code/config diffs outside docs |

---

## P4.1 — Hygiene (delete / ignore / archive)

| | |
|--|--|
| **Objective** | Remove tracked scratch and reduce root noise without relocating apps |
| **Folders affected** | Root `.tmp-*`, `build.*`, optional `tmp/`; move root planning MD → `docs/archive/`; move ad-hoc SQL → `tools/adhoc/` (create folder); update `.gitignore` for `.tmp*`, `tmp/` |
| **Risk** | Low — if a scratch file was reused as a secret store, ensure not needed |
| **Rollback** | `git revert` the hygiene commit |
| **Validation** | `git status` clean of `.tmp*`; `npm run build` (web) still works; engine `npm run typecheck` still works; no import path changes |

**Do not** move `app/`, `game-engine/`, or `sql/` in this phase.

---

## P4.2 — Workspace scaffolding (no folder moves)

| | |
|--|--|
| **Objective** | Add monorepo metadata so later moves have a home |
| **Folders affected** | Root `package.json` (workspaces field or `pnpm-workspace.yaml`), stub `apps/` + `packages/` README placeholders; keep existing package locations working |
| **Risk** | Medium — wrong workspace config can break `npm install` |
| **Rollback** | Revert workspace files; reinstall from previous lockfile |
| **Validation** | Fresh install at root; `npm run build` at current Next root; `cd game-engine && npm run build`; CI green if present |

**Constraint:** Apps still live at current paths until P4.3/P4.4.

---

## P4.3 — Relocate Game Engine → `game-engine`

| | |
|--|--|
| **Objective** | Engine lives under `apps/` without logic changes |
| **Folders affected** | `game-engine/` → `apps/game-engine/`; docs links; `scripts/sync-game-engine-env.ps1` paths; Dockerfile context |
| **Risk** | **High** — Railway build root / watch path must update in lockstep |
| **Rollback** | Move directory back; restore Railway root to `game-engine/`; redeploy previous image |
| **Validation** | Local: `cd game-engine && npm run build && npm start` → `/health` 200; Railway staging deploy; `SCHEDULER_ENABLED` unchanged; web still talks to staging URL; no Next import of engine source |

**Deploy checklist (staging first):**

1. Merge code move.
2. Set Railway root directory to `game-engine`.
3. Redeploy; confirm `/health` + `/ready`.
4. Smoke: lobby / live-room engine path if flags on.
5. Then production.

---

## P4.4 — Relocate Next.js → `apps/web`

| | |
|--|--|
| **Objective** | Web app isolated under `apps/web` |
| **Folders affected** | `app/`, `components/`, `contexts/`, `lib/`, `services/`, `src/`, `public/`, root Next configs, root `package.json` → `apps/web/`; root becomes workspace orchestrator |
| **Risk** | **High** — Vercel Root Directory, path aliases (`@/*`), middleware location, env file paths, PWA `public/` |
| **Rollback** | Revert move; set Vercel root back to `/`; redeploy previous deployment |
| **Validation** | Local `apps/web` dev + build; auth login; player lobby; admin host middleware; API `/api/player/live-room`; staging Vercel; compare response shapes |

**Deploy checklist:**

1. Staging Vercel Root Directory = `apps/web`.
2. Confirm env vars still attached to project.
3. Confirm `MAIN_APP_HOST` / `ADMIN_APP_HOST` redirects.
4. Production cutover only after staging soak.

---

## P4.5 — Relocate SQL + Supabase → `infrastructure/`

| | |
|--|--|
| **Objective** | Single infra home; clarify canonical migrations |
| **Folders affected** | `sql/` → `infrastructure/sql/`; `supabase/` → `infrastructure/supabase/` (exclude `.temp` from git); update docs/runbooks paths; optional Supabase CLI `config` path docs |
| **Risk** | Medium — operators applying migrations from old path; CLI linked project paths |
| **Rollback** | Move trees back; restore doc links |
| **Validation** | Migration file count unchanged; no SQL content edits; document “apply from `infrastructure/sql/migrations`”; Supabase CLI still links; **do not** apply migrations as part of this phase |

**Policy decision in this phase (docs only if needed):** `infrastructure/sql/migrations` remains canonical; `infrastructure/supabase/migrations` either synced or marked deprecated.

---

## P4.6 — Relocate tools + finish archive

| | |
|--|--|
| **Objective** | Ops scripts and ad-hoc assets leave the mental “app” space |
| **Folders affected** | `scripts/` → `tools/scripts/`; `.supabase-config-push/` → `tools/` or delete; `notebooks/` delete/move; remaining root MD → `docs/archive/` |
| **Risk** | Low–medium — broken bookmarks in runbooks / muscle memory |
| **Rollback** | Revert path moves |
| **Validation** | Env switch scripts run from new paths; README updated; no runtime import of `scripts/` from apps (today there should be none) |

---

## P4.7 — Extract `packages/shared-types` (+ constants)

| | |
|--|--|
| **Objective** | First real shared package: DTOs / enums used by web + engine |
| **Folders affected** | Expand `packages/shared-types` from `packages/game-contracts`; re-export from `apps/web/src/types` and engine types **without** changing wire shapes |
| **Risk** | Medium — type-only changes can still break builds; avoid runtime behavior change |
| **Rollback** | Point imports back to local types; unpublish workspace dependency |
| **Validation** | `tsc` both apps; golden JSON fixtures for `/v1/live-room` and Next route unchanged; no field renames |

---

## P4.8 — De-dupe high-drift mirrors

| | |
|--|--|
| **Objective** | Single implementation for live-room PG loader, provably-fair RNG, optionally pg pool |
| **Folders affected** | `packages/shared-snapshots`, `packages/shared-utils`, `packages/shared-db`; thin wrappers left in apps |
| **Risk** | **High** — parity bugs in live game path |
| **Rollback** | Feature-flag or revert to previous duplicated modules; keep previous files one release |
| **Validation** | Side-by-side snapshot parity tests (Next vs Engine vs package); staging CCU soak; draw fairness verify page; financial RPCs untouched |

**Order inside P4.8:**

1. `shared-utils` provably-fair (pure)  
2. `shared-db` pool factory  
3. `shared-snapshots` live-room / gameroom / lobby  

---

## Risk analysis (cross-phase)

| Risk | Phases | Mitigation |
|------|--------|------------|
| Deploy root mismatch | P4.3, P4.4 | Staging first; rollback runbook; keep old path one commit away |
| Import alias breakage (`@/*`) | P4.4 | Keep `@/*` → app root; update `tsconfig` paths only |
| Migration path confusion | P4.5 | Single canonical path documented; no SQL edits |
| Silent parity drift during de-dupe | P4.8 | Fixture tests before deleting mirrors |
| Workspace install breakage | P4.2 | Lockfile commit; one package manager only |
| Accidental behavior change | All | Diff discipline: moves-only PRs; no logic in move PRs |

---

## Rollback strategy (global)

1. **Prefer git revert** of the phase PR.  
2. **Platform roots:** keep a short checklist of previous Railway/Vercel Root Directory values in `docs/runbooks/` (add during P4.3/P4.4).  
3. **Never combine** “move folders” + “change GAME_RUNTIME / flags / SQL” in one PR.  
4. **Engine scheduler:** leave `SCHEDULER_ENABLED` semantics unchanged during moves to avoid double-tick with production.

---

## Validation matrix (behavior freeze)

For each phase that touches deployable apps, run at minimum:

| Check | Pass criteria |
|-------|----------------|
| Web build | `next build` succeeds |
| Engine build | `tsc` succeeds |
| Auth | Login → post-login → player home |
| Lobby | Snapshot loads (legacy and/or engine path per current flags) |
| Live room | Draws update; fallback path still works if engine down |
| Admin host | `/admin` on main host redirects |
| Wallet admin | No new errors on adjust (staging only) |
| Health | Engine `/health` + `/ready` |

---

## Suggested PR slicing

1. Docs only — **P4.0** (this audit)  
2. Hygiene — **P4.1**  
3. Workspace stub — **P4.2**  
4. Engine move + Railway — **P4.3**  
5. Web move + Vercel — **P4.4**  
6. Infra SQL move — **P4.5**  
7. Tools move — **P4.6**  
8. Types package — **P4.7**  
9. Snapshot/RNG de-dupe — **P4.8** (possibly multiple PRs)

---

## Explicit non-phases (do later, separately)

- Feature-folder rewrite of `app/` route groups (`ARCHITECTURE_PLAN.md`)
- Removing duplicate `(protected)` / test pages
- Edge function deletion on Supabase remote
- Multi-replica Railway role split production cutover
- Admin as separate Vercel project (not required by target)

---

## Exit criteria for “folder migration complete”

- [ ] `apps/web` and `game-engine` are the only deployable app roots  
- [ ] `infrastructure/sql/migrations` is the documented migration SoT  
- [ ] `tools/` holds ops scripts; root has no `.tmp*` or build logs  
- [ ] `packages/shared-types` is imported by both apps  
- [ ] Vercel + Railway roots updated and documented  
- [ ] No intentional product behavior change vs pre-migration baseline  

---

## P4.0 deliverables checklist

| Deliverable | Path |
|-------------|------|
| Current audit | `docs/architecture/p4-0-current-repository-audit.md` |
| Current map | `docs/architecture/p4-0-current-repository-map.md` |
| Target architecture | `docs/architecture/p4-0-target-architecture.md` |
| Migration roadmap | `docs/architecture/p4-0-migration-roadmap.md` |
