# P4.4 — Workspace Foundation

> **Phase:** Prepare permanent multi-engine monorepo layout + empty shared packages.  
> **Date:** 2026-08-03  
> **Not done:** code extraction, SQL/Supabase moves, API changes, Railway/Vercel config, commit/push

Companions: [p4-4-shared-contracts-plan.md](./p4-4-shared-contracts-plan.md) · [p4-4-service-identity.md](./p4-4-service-identity.md)

---

## Workspace layout (after P4.4)

```
winway-dev/
├── apps/
│   ├── web/                      # PLACEHOLDER README — Next.js still at repo root
│   └── engines/
│       ├── bingo/                # live Bingo engine
│       └── backgammon/           # placeholder
├── packages/
│   ├── shared-types/             # empty scaffold
│   ├── shared-events/            # empty scaffold
│   ├── shared-utils/             # empty scaffold
│   ├── shared-db/                # empty scaffold
│   └── game-contracts/           # docs + empty scaffold
├── infrastructure/               # PLACEHOLDER README — sql/supabase not moved
├── tools/                        # existing ops/dev helpers (+ README)
├── app/ … public/ …              # Next.js (unchanged location)
├── sql/                          # unchanged
├── scripts/                      # unchanged location
└── package.json                  # workspaces: ["packages/*"]
```

---

## What was enabled

| Item | Detail |
|------|--------|
| Root npm workspaces | `"workspaces": ["packages/*"]` only |
| Empty packages | Five packages under `packages/` — README + package.json + minimal tsconfig/`src/index.ts` |
| Placeholders | `apps/web/`, `infrastructure/` (no moves) |
| App code | **Not extracted / not moved** |

**Not in workspaces yet:** `apps/engines/bingo` (keeps its own `package-lock.json`), root Next app.

---

## Package purposes

| Package | Purpose |
|---------|---------|
| `@dingmoney/shared-types` | Future DTOs shared by web + engines |
| `@dingmoney/shared-events` | Future event name constants / envelopes |
| `@dingmoney/shared-utils` | Future pure helpers (no React/Next) |
| `@dingmoney/shared-db` | Future server-only PG helpers |
| `@dingmoney/game-contracts` | Engine contract documentation (+ future contract types) |

No app depends on these packages in P4.4.

---

## Dependency audit

| Consumer | Depends on `@dingmoney/shared-*` or `game-contracts`? |
|----------|--------------------------------------------------------|
| Root Next `package.json` | **No** |
| `apps/engines/bingo/package.json` | **No** |
| Empty packages | Only `typescript` as devDependency |

Compile path unchanged: Next from root; Bingo from `apps/engines/bingo`.

---

## Validation

| Check | Result |
|-------|--------|
| Root `npm install` (workspaces) | **PASS** |
| Root / web `npm run build` | **PASS** (Next still at repo root) |
| Bingo `npm install` / `build` / `test` | **PASS** (87 tests) |
| Dependency audit (apps → shared packages) | **CLEAN** — no deps |
| Local `GET /health` | **PASS** `{"ok":true,"service":"bingo-engine","redis":"disabled"}` |
| Railway live health | Unchanged until redeploy (not modified in this phase) |

---

## Rollback

1. Remove `workspaces` from root `package.json`  
2. Delete `packages/shared-*` scaffolds and restore prior `packages/game-contracts/README.md` if needed  
3. Delete `apps/web/`, `infrastructure/` placeholders  
4. Revert bingo identity strings (`bingo-engine` → `game-engine`) and package name  
5. Reinstall root + bingo deps  

---

## Explicit non-goals

- Moving Next.js into `apps/web`  
- Moving `sql/` / `supabase/` into `infrastructure/`  
- Extracting Bingo mirrors into shared packages  
- Wiring `dependencies` on shared packages  
- Railway / Vercel changes  
