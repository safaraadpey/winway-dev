# P4.1 — Repository Root Cleanup

> **Phase:** P4.1 Root Hygiene  
> **Date:** 2026-08-03  
> **Constraint:** No app moves, no import/package/workspace/deploy changes, no runtime behavior changes  
> **Prior:** [p4-0-current-repository-audit.md](./p4-0-current-repository-audit.md)

---

## Summary

Root temporary MCP/build artifacts were **deleted**. A permanent local scratch dir **`.tmp/`** was created (gitignored). Developer-only notebooks, ad-hoc SQL, and one-off scripts were moved under **`tools/`**. Root planning/legacy setup docs were moved to **`docs/archive/`**. Operational scripts remain in **`scripts/`**. Canonical SQL under **`sql/`** was not relocated. **`package.json`**, **`apps/game-engine/`**, Next app layout, Railway, and Vercel assumptions are unchanged.

---

## Removed files

### MCP / migration scratch (confirmed temporary)

| File |
|------|
| `.tmp-apply-args-only.json` |
| `.tmp-apply-args-utf8.json` |
| `.tmp-apply-name-only.txt` |
| `.tmp-apply-name.txt` |
| `.tmp-apply-only.json` |
| `.tmp-apply-query-only.bin` |
| `.tmp-apply-query.txt` |
| `.tmp-build-payloads.js` |
| `.tmp-call-args.json` |
| `.tmp-exec-args.json` |
| `.tmp-exec-only.json` |
| `.tmp-exec-sql-args.json` |
| `.tmp-exec-sql-payload.json` |
| `.tmp-final-mcp-call.json` |
| `.tmp-mcp-apply-request.json` |
| `.tmp-mcp-apply-result-marker.txt` |
| `.tmp-mcp-apply.json` |
| `.tmp-mcp-args-b64.txt` |
| `.tmp-mcp-call.json` |
| `.tmp-migration-args.json` |
| `.tmp-payload-for-mcp.json` |
| `.tmp-q1.txt` |
| `.tmp-q2.txt` |
| `.tmp-q3.txt` |

### Build / debug logs

| File | Reason |
|------|--------|
| `build.log` | Accidental Next build stdout |
| `build.err` | Accidental Next build stderr |
| `build.debug.log` | Debug noise |
| `.cursor/debug-0c2b3d.log` | Cursor debug log |

### Sensitive / obsolete temp extract

| File | Reason |
|------|--------|
| `tmp/winway_old-users-balances.temp.md` | Temporary balance extract (PII/financial); **deleted** (not kept in `.tmp/`) |
| `tmp/` (empty directory) | Removed after file delete |

Nothing non-temporary was deleted.

---

## Created

| Path | Purpose |
|------|---------|
| `.tmp/` | Permanent **local** temporary workspace (gitignored) |
| `.tmp/README.txt` | Local note only (ignored with `.tmp/`) |
| `tools/` | Developer-only resources |
| `tools/adhoc/` | One-off discovery SQL |
| `tools/dev/` | Dev helper scripts / signup debug notes |
| `tools/notebooks/` | Notebooks |
| `tools/supabase-config-push/` | Former `.supabase-config-push` CLI staging tree |
| `docs/archive/` | Former root planning / legacy setup docs |

---

## Moved files

### → `tools/notebooks/`

| From | To |
|------|----|
| `notebooks/placeholder.ipynb` | `tools/notebooks/placeholder.ipynb` |
| `notebooks/` | removed (empty) |

### → `tools/adhoc/`

| From | To |
|------|----|
| `find_tickets_functions.sql` | `tools/adhoc/find_tickets_functions.sql` |
| `find_tickets_functions_simple.sql` | `tools/adhoc/find_tickets_functions_simple.sql` |
| `find_tickets_update_functions.sql` | `tools/adhoc/find_tickets_update_functions.sql` |
| `get_all_tables.sql` | `tools/adhoc/get_all_tables.sql` |
| `list_all_tables.sql` | `tools/adhoc/list_all_tables.sql` |
| `supabase-migration-add-won-at.sql` | `tools/adhoc/supabase-migration-add-won-at.sql` |

### → `tools/dev/` (from `scripts/`, developer-only)

| From | To |
|------|----|
| `scripts/execute-tickets-query.js` | `tools/dev/execute-tickets-query.js` |
| `scripts/find-tickets-functions-direct.js` | `tools/dev/find-tickets-functions-direct.js` |
| `scripts/list-tables.ts` | `tools/dev/list-tables.ts` |
| `scripts/seed-winway-old-list-users.cjs` | `tools/dev/seed-winway-old-list-users.cjs` |
| `scripts/debug-signup-error.md` | `tools/dev/debug-signup-error.md` |
| `scripts/quick-fix-signup.md` | `tools/dev/quick-fix-signup.md` |
| `scripts/check-signup-issue.md` | `tools/dev/check-signup-issue.md` |
| `scripts/test-signup-flow.sql` | `tools/dev/test-signup-flow.sql` |
| `scripts/test-trigger-manually.sql` | `tools/dev/test-trigger-manually.sql` |
| `scripts/test-referral-code.sql` | `tools/dev/test-referral-code.sql` |

Path string inside `tools/dev/find-tickets-functions-direct.js` updated to point at `tools/adhoc/…` (console guidance only).

### → `tools/supabase-config-push/`

| From | To |
|------|----|
| `.supabase-config-push/**` | `tools/supabase-config-push/**` |

### → `docs/archive/` (root doc hygiene)

| From | To |
|------|----|
| `ARCHITECTURE_PLAN.md` | `docs/archive/ARCHITECTURE_PLAN.md` |
| `DING_SYSTEM.md` | `docs/archive/DING_SYSTEM.md` |
| `draw_jobs_occurrences.md` | `docs/archive/draw_jobs_occurrences.md` |
| `fn_manage_waiting_rooms_references.md` | `docs/archive/fn_manage_waiting_rooms_references.md` |
| `FRONTEND_PAGES_STATUS.md` | `docs/archive/FRONTEND_PAGES_STATUS.md` |
| `LEADERBOARD_SETUP.md` | `docs/archive/LEADERBOARD_SETUP.md` |
| `SETUP_GUIDE.md` | `docs/archive/SETUP_GUIDE.md` |
| `supabase-schema.sql` | `docs/archive/supabase-schema.sql` |
| `supabase-setup.md` | `docs/archive/supabase-setup.md` |

`README.md` links updated to the archive paths (and note that `sql/migrations/` is canonical).

---

## `scripts/` after cleanup (operational only)

Kept (not moved):

| File | Role |
|------|------|
| `sync-game-engine-env.ps1` | Env sync (ops) |
| `sync-supabase-develop-env.ps1` | Env sync (ops) |
| `use-supabase-develop.ps1` | Env switch (ops) |
| `use-supabase-main.ps1` | Env switch (ops) |
| `test-connection.js` | Referenced by `package.json` `test:supabase` |
| `game-engine-cron-*.sql` | Cron / ops SQL (not relocated — production ops) |
| `dev-schedule-worker-cron.sql` | Ops cron SQL |
| `create-admin-*`, `setup-admin-zero.sql`, `check-admin-status.sql`, `fix-adminzero-metadata.md` | Admin bootstrap ops |
| `cleanup-game-transactions.sql` | Ops cleanup |

**Not relocated:** `sql/migrations/`, `sql/functions/`, production migration SQL.

---

## Updated `.gitignore`

Added / reinforced:

```
# P4.1 — temporary workspace, scratch payloads, build/debug output
.tmp/
.tmp-*
/tmp/
logs/
build.log
build.err
build.debug.log
*.err
.cursor/*.log
game-engine/node_modules
game-engine/dist
.tmp-*.json
.tmp-*.txt
.tmp-*.bin
.tmp-*.js
```

Existing ignores retained (`.next/`, `node_modules`, `.env*.local`, `*.tsbuildinfo`, etc.).

**Not ignored:** application source, `sql/`, `scripts/` ops files, `tools/` (tracked), `docs/`.

---

## Explicitly unchanged

| Item | Status |
|------|--------|
| `app/`, `components/`, `lib/`, `services/`, `src/`, `public/` | Unmoved |
| `apps/game-engine/` | Unmoved (Railway Dockerfile path unchanged) |
| Root `package.json` / lockfile | Unchanged |
| Workspace tooling | Not introduced |
| Railway / Vercel / Supabase project config | Unchanged |
| `sql/` canonical migrations | Unmoved |
| Application imports / runtime code | No behavior changes |

---

## Validation

| Check | Result |
|-------|--------|
| `npm install` (repo root) | **PASS** (exit 0; pre-existing EBADENGINE warnings for Node 20 vs some supabase-js engine hints) |
| `npm run build` (Next.js) | **PASS** (exit 0) |
| Railway build assumptions | **Unchanged** — `apps/game-engine/Dockerfile` still at `apps/game-engine/`; working directory still `apps/game-engine/` |
| Vercel assumptions | **Unchanged** — Next root still repo root (`package.json`, `app/`, `next.config.mjs`, `middleware.ts`) |
| Runtime differences | **None intended** — hygiene + path moves of non-runtime assets only |

Game-engine `npm run typecheck` was skipped locally (`game-engine/node_modules` absent). Engine package path and Docker build context were not modified.

---

## Rollback plan

1. **Restore deleted temps (if ever needed):**  
   `git checkout HEAD -- .tmp-* build.log build.err build.debug.log tmp/`  
   (prefer not restoring MCP payloads or the balances extract)

2. **Undo moves:**  
   Reverse the From→To tables above with `git mv` / `git checkout` of previous paths.

3. **Restore `.gitignore` / `README.md`:**  
   `git checkout HEAD -- .gitignore README.md`

4. **Full phase revert (after a future commit):**  
   `git revert <p4.1-commit>`

No deploy-platform rollback is required for this phase (no Railway/Vercel changes).

---

## Root after P4.1 (high level)

```
winway-dev/
├── .tmp/                 # local scratch (gitignored)
├── app/ … public/        # Next app (unchanged location)
├── game-engine/          # Engine (unchanged location)
├── docs/
│   ├── architecture/     # + p4-1-root-cleanup.md
│   └── archive/          # former root planning docs
├── scripts/              # operational only
├── sql/                  # canonical migrations (untouched)
├── tools/
│   ├── adhoc/
│   ├── dev/
│   ├── notebooks/
│   └── supabase-config-push/
├── package.json          # unchanged
└── …
```
