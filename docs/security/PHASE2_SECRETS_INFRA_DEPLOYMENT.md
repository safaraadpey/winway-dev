# Phase 2 — Secrets, Infrastructure & Deployment Security (Read-Only)

**Platform:** Ding Money (winway)  
**Phase:** 2 — Secrets, infra, deployment, browser exposure  
**Date:** 2026-07-21  
**Status:** Read-only audit; no files or configuration were modified.

**Related:** [Phase 1 — Architecture & Attack Surface](./PHASE1_ARCHITECTURE_ATTACK_SURFACE_AUDIT.md) · [Phase 3 — Auth, RLS & authorization](./PHASE3_AUTH_RLS_AUTHORIZATION.md) · [Phase 4 — Wallet & financial](./PHASE4_WALLET_DING_FINANCIAL.md) · [Phase 5 — Game engine](./PHASE5_GAME_ENGINE_REDIS_CONCURRENCY.md)

---

## Executive summary

| Area | Assessment |
|------|------------|
| **Service role / DB URL in client bundle** | No imports of `lib/supabaseServer` or `lib/pg` from client components found; server secrets use non-`NEXT_PUBLIC_` names. |
| **`.env` in git** | Real `.env.local` / `game-engine/.env` are **gitignored**; only `*.example` files are tracked. |
| **Tracked credential-like content** | No JWT (`eyJ…`) strings found in tracked files via `git grep`. Historical commits touch `service_role` in **SQL/migrations**, not live keys (sampled). |
| **HTTP hardening (Next.js)** | `next.config.mjs` is empty — **no** CSP, security headers, or source-map policy in repo. |
| **CI/CD in repo** | **No** `.github/workflows` present; deployment isolation depends on Vercel/Railway dashboard config (**not verifiable from repo alone**). |
| **Highest repo-local risks** | Hardcoded seed password + user roster in git; verbose wallet API logging; public `NEXT_PUBLIC_GAME_ENGINE_URL`; default engine CORS `*`; develop Supabase project ref in examples; many tracked `.tmp-*` artifacts. |

---

## 1. Secret & environment variable inventory

### 1.1 Server-only (must never be `NEXT_PUBLIC_*`)

| Variable | Used in | Purpose |
|----------|---------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabaseServer.ts`, API routes, game-engine | Bypass RLS; admin/service RPCs |
| `DATABASE_URL` | `lib/pg.ts`, `game-engine/src/db/pg.ts` | Direct PostgreSQL |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | `game-engine/src/config/env.ts`, `redis/client.ts` | Redis REST (engine) |
| `REDIS_URL` | game-engine | Redis protocol (ioredis / Upstash) |
| `MAIN_APP_HOST` / `ADMIN_APP_HOST` | `middleware.ts` | Host-based redirect (server) |
| `GAME_ENGINE_CORS_ORIGINS` | `game-engine/src/http/cors.ts` | Engine CORS allowlist |
| `GAME_ENGINE_API` | game-engine `env.ts` | Enable `/v1` command API |
| `GAME_ENGINE_ROLES`, `SCHEDULER_ENABLED`, worker tuning | game-engine | Process roles |
| `SUPABASE_URL` | game-engine (non-public name) | Engine Supabase URL (parallel to Next `NEXT_PUBLIC_*`) |

**Documentation:** `.env.local.example`, `.env.develop.local.example`, `game-engine/.env.example`, `README.md`, `docs/incidents/2026-06-16-supabase-postgrest-partial-read.md`.

**Not found in repository:** `JWT_SECRET`, webhook signing secrets, `CRON_SECRET`, `VERCEL_*` env usage in code, Railway API tokens, Stripe/payment API keys.

### 1.2 Intentionally public (`NEXT_PUBLIC_*` → embedded in browser bundle)

| Variable | Location | In bundle? | Notes |
|----------|----------|------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/env.ts`, client | **Yes** | Expected for Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | **Yes** | Expected; must rely on RLS/RPC guards |
| `NEXT_PUBLIC_USE_GAME_ENGINE` | `lib/gameEngine/config.ts` | **Yes** | Feature flag |
| `NEXT_PUBLIC_GAME_ENGINE_URL` | same | **Yes** | **Exposes engine origin to all users when set** |
| `NEXT_PUBLIC_USE_CARD_POOL_CACHE` | `lib/cardPool/config.ts` | **Yes** | Feature flag |
| `NEXT_PUBLIC_MAIN_ORIGIN` / `NEXT_PUBLIC_ADMIN_ORIGIN` | layouts, metadata | **Yes** | Site URLs |
| `NEXT_PUBLIC_MAIN_HOST` / `NEXT_PUBLIC_ADMIN_HOST` | `lib/auth/portalHosts.ts` | **Yes** | Hostnames |
| `NEXT_PUBLIC_ACTIVE_GAMES_SOURCE` | `useActiveGames`, orchestrator | **Yes** | Behavior toggle |

**Exploitability:** Anon key + URL are **designed** to be public; risk is entirely in PostgREST grants/RLS (Phase 1). `NEXT_PUBLIC_GAME_ENGINE_URL` aids recon and cross-origin calls when engine CORS is permissive.

### 1.3 Optional / commented in examples

- `UPSTASH_REDIS_REST_*` in `.env.local.example` (Next app lists optional lobby cache — **no Upstash usage found in Next `*.ts` sources**; dependency exists in root `package.json` but engine owns Redis).
- `DATABASE_URL` in develop example (commented template with `[password]` placeholder).

---

## 2. Browser bundle exposure analysis

### 2.1 Server modules — import graph

| Module | Secret access | Client import? |
|--------|---------------|----------------|
| `lib/supabaseServer.ts` | `SUPABASE_SERVICE_ROLE_KEY` at module load | **No** — only `app/api/**`, auth helpers used from server routes |
| `lib/pg.ts` | `DATABASE_URL` | **No** — API routes + server libs only |
| `lib/supabase/server.ts` | Anon + cookies only | Server Components / layouts |
| `lib/supabaseClient.ts` | Anon only | Client (expected) |

`tsconfig.json` **excludes** `game-engine` from the Next project — reduces accidental bundling of engine code.

### 2.2 Client components using env

- `app/(settings)/test-connection/page.tsx` — reads `NEXT_PUBLIC_SUPABASE_*` only (does not display raw key in success path; validates presence).
- `lib/gameEngineClient.ts` — uses session `access_token` in memory for engine calls (not env secret).
- `services/transactions.ts`, `lib/adminApiClient.ts` — attach `Bearer` from session to `/api/admin/*` (correct pattern).

### 2.3 `lib/supabaseServer` top-level throw

```12:26:lib/supabaseServer.ts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
// ...
if (!supabaseServiceRoleKey) {
  throw new Error(
    'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
```

If this module were ever imported from a Client Component, the build would fail or leak the **error message** — current graph shows **API-only** usage.

---

## 3. `.env` files, examples, and git hygiene

### 3.1 Gitignore (effective)

From `.gitignore`:

- `.env*.local`, `.env`
- `game-engine/.env`, `game-engine/.env.*` (with exceptions for `!.env.example` and `!.env.develop.local.example`)

Local files present on disk (e.g. `.env.local`, `game-engine/.env`) are **ignored** — not audited for contents (avoid reading secrets into the report).

### 3.2 Tracked examples

| File | Notes |
|------|--------|
| `.env.local.example` | Placeholders only |
| `.env.develop.local.example` | **Real develop project URL** `https://ovclbgxtpxyzlcmwbviw.supabase.co` + ref in comment — not a secret key, but **environment fingerprint** |
| `game-engine/.env.example` | Empty placeholders; documents Redis/scheduler |

### 3.3 Repository history (limited check)

- `git ls-files` for `.env.local` / `game-engine/.env`: **not tracked**.
- `git grep eyJhbGci` on tracked files: **no matches**.
- `git log --all -S "service_role"`: commits reference **SQL/migrations** and `.tmp` migration payloads, not live JWT keys (spot-check).

**Gap:** Full history secret scan (e.g. `gitleaks`, `trufflehog`) was **not** run; recommend offline scan on clone.

---

## 4. Hardcoded credentials & sensitive scripts

### P2-HIGH-1 — Seed script with fixed password and user roster (tracked)

- **File:** `scripts/seed-winway-old-list-users.cjs`
- **Lines:** ~3–9 (`PASSWORD = "123456"`), uses `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`
- **Exploitability:** If an operator runs this against **production** (or commits `.env.local` elsewhere), all seeded users share a **known password**. Script is **in git** with real-style usernames and balance hints.
- **Severity:** **HIGH** (operational / supply-chain); **CRITICAL** only if ever run on prod with service role.

### P2-MED-1 — `list-tables.ts` assumes `exec_sql` RPC with anon key

- **File:** `scripts/list-tables.ts` (~22–34)
- **Exploitability:** Dev script only; if `exec_sql` exists and is granted to anon/authenticated in DB, this pattern mirrors a dangerous RPC (see Phase 1).

### P2-INFO-1 — Dev cron SQL references vault secret placeholder

- **File:** `scripts/dev-schedule-worker-cron.sql` — comment `vault.create_secret('<SERVICE_ROLE_KEY>', …)` — documentation only.

---

## 5. Infrastructure & deployment (repo evidence)

| Component | Repo evidence | Secrets handling |
|-----------|---------------|------------------|
| **Vercel (Next.js)** | `README.md`, no `vercel.json` | Env vars set in dashboard; not in repo |
| **Railway (game-engine)** | Comments, `engineIdentity.ts` (`RAILWAY_REPLICA_ID`), `Dockerfile` | Env at deploy time; not in repo |
| **Supabase** | Client + service role + optional `DATABASE_URL` | Anon public; service role server-only |
| **Upstash Redis** | game-engine only | `REDIS_URL` or REST URL+token — server only |
| **Docker** | `game-engine/Dockerfile` | Multi-stage build; **no** `COPY .env` |
| **docker-compose** | `game-engine/docker-compose.multi-replica.yml` | Local `redis://redis:6379` only |
| **CI/CD** | **No** `.github/workflows` | N/A in repo |

### P2-MED-2 — PostgreSQL TLS verification disabled

- **File:** `lib/pg.ts` (~13–16)
- **Code:** `ssl: { rejectUnauthorized: false }`
- **Exploitability:** On Vercel → Supabase pooler, MITM could read `DATABASE_URL` credentials in transit if attacker controls network path (typically **MEDIUM** in cloud, higher on untrusted networks).

### P2-INFO-2 — Engine logs config presence, not values

- **File:** `game-engine/src/index.ts` — logs `databaseUrl: "configured" | "missing"` (not the URL string).

---

## 6. CORS, headers, CSP, cookies

### 6.1 CORS

| Surface | Config | Default / risk |
|---------|--------|----------------|
| Game Engine | `game-engine/src/http/cors.ts` | If `GAME_ENGINE_CORS_ORIGINS` unset or `*`, **`Access-Control-Allow-Origin: *`** |
| Next.js API | No explicit CORS middleware in repo | Same-origin browser calls; third-party sites cannot read responses without CORS headers (same-origin policy for reads) |
| Supabase | Hosted | Supabase project settings (**not in repo**) |

**Finding P2-HIGH-2 — Engine CORS default `*`**

- **Exploitability:** Malicious site can trigger **credentialed browser requests** to the engine **if** user JWT is available (XSS, extension, physical access). Engine requires `Authorization: Bearer` — CORS does not bypass auth, but **increases XSS blast radius** for join/read endpoints.

### 6.2 Security headers & CSP

- **File:** `next.config.mjs` — `{}` (empty).
- **No** `headers()`, `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, or `Permissions-Policy` defined in repository.
- **Exploitability:** Relies on Vercel defaults (if any). Clickjacking, XSS impact, and mixed content not constrained by app config in repo — **MEDIUM** defense-in-depth gap.

### 6.3 Cookies (Supabase Auth)

- **Files:** `lib/supabase/middleware.ts`, `lib/supabase/server.ts`, `@supabase/ssr` browser client
- **Repo-defined flags:** None — cookie `HttpOnly` / `Secure` / `SameSite` delegated to **Supabase SSR defaults** and hosting (HTTPS).
- **Note:** Player APIs use **Bearer token from `getSession()`** in fetch paths; session still lives in cookies for SSR. No custom auth cookie code to audit in-repo.

### 6.4 Source maps

- Next.js: no `productionBrowserSourceMaps` in config → Next default (**typically off** in production).
- **game-engine:** `game-engine/tsconfig.json` — `"sourceMap": true` for **compiled Node output** on Railway (not shipped to browsers) — **LOW** if dist/maps not published publicly.

---

## 7. Debug endpoints, logging, and error disclosure

### 7.1 Development / test routes (deployable unless blocked at edge)

| Route | Risk |
|-------|------|
| `app/(settings)/test-connection/page.tsx` | Probes Supabase; public if deployed |
| `app/test-bingo`, `app/test-results`, `app/(game)/test-bingo-card`, etc. | Test UI in production build |
| `app/(settings)/test-connection` | Same |

**P2-MED-3 — Test pages not gated by `NODE_ENV` in routing**

- **Exploitability:** On production/preview Vercel URLs, paths may be reachable unless blocked by WAF or auth — **recon and Supabase probe**.

### 7.2 Client debug helpers

| File | Behavior |
|------|----------|
| `lib/debug/netTrace.ts` | `NODE_ENV !== "development"` gate + `localStorage.NET_TRACE` |
| `lib/pwa/pwaDebug.ts` | Dev-oriented |
| `lib/contexts/SessionContext.tsx`, `PlayerLayoutClient.tsx` | Early return in `production` for some debug paths |

### 7.3 Server logging (sensitive metadata)

**P2-MED-4 — Wallet adjust logs request metadata**

- **File:** `app/api/admin/wallet/adjust/route.ts` (~24, ~43–48, ~117–121)
- **Logs:** Admin id, role, `userIds` count, amount, action, per-user errors
- **Exploitability:** Vercel/Railway log aggregation — insider or log breach exposes **financial operation patterns**; not full PAN but operational sensitivity — **MEDIUM**.

**P2-LOW-1 — Gameroom / engine path console.info**

- Multiple `[ENGINE_PATH]`, `[LEGACY_PATH]`, debug RPC logging on hot paths — noise + potential room/user counts in logs.

### 7.4 API error bodies

Many routes return `err.message` from Supabase/Postgres to clients (e.g. admin dashboard, dev-panel, wallet). **Exploitability:** **LOW–MEDIUM** info disclosure (schema hints, constraint names) — not full stack traces in responses from sampled routes.

---

## 8. Environment isolation (prod / preview / develop)

| Mechanism | Repo | Assessment |
|-----------|------|------------|
| Separate Supabase develop branch | `.env.develop.local.example`, `scripts/sync-supabase-develop-env.ps1` | **Documented** staging project ref |
| `NODE_ENV` gates | PWA debug, net trace, some layouts | Partial |
| Vercel Preview env | Not in repo | **Unknown** — if Preview uses **production** `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL`, preview URLs become high-risk |
| Host split admin/player | `middleware.ts` + env hosts | Reduces admin UI on main host; **not** API isolation |
| `SCHEDULER_ENABLED` default false in engine example | `game-engine/.env.example` | Reduces accidental prod ticks locally |

**P2-HIGH-3 — Preview deployment misconfiguration (operational)**

- **Exploitability:** Vercel preview with production secrets → `/api/admin/*`, service role, and unauthenticated tournament routes (Phase 1) on a shareable URL — **CRITICAL** if misconfigured; **HIGH** as standing risk without repo proof either way.

---

## 9. Tracked artifacts & repo clutter

**P2-MED-5 — Many `.tmp-*` files committed**

- Examples: `.tmp-mcp-call.json`, `.tmp-apply-query.txt`, `.tmp-mcp-args-b64.txt`, …
- **Content:** Migration SQL, MCP payloads — **no live JWT found** in grep sample, but **bad practice** (future accidental secret paste).
- **`.gitignore` does not exclude `.tmp*`.**

---

## 10. Dependency notes

- Root `package.json` includes `@upstash/redis` and `ioredis` — **no Next app TypeScript usage** found; Redis credentials only wired in **game-engine**.
- `@supabase/supabase-js` + `@supabase/ssr` — standard; anon in browser.

---

## 11. Findings summary (Phase 2)

| ID | Severity | Title | Location | Exploitability |
|----|----------|-------|----------|----------------|
| P2-HIGH-1 | HIGH | Hardcoded seed password `123456` + service-role seed script in git | `scripts/seed-winway-old-list-users.cjs` | Run against wrong env → mass accounts with known password |
| P2-HIGH-2 | HIGH | Game Engine CORS defaults to `*` | `game-engine/src/http/cors.ts` | Amplifies XSS impact against `/v1/*` with stolen JWT |
| P2-HIGH-3 | HIGH | Preview/prod env isolation not enforceable from repo | Vercel/Railway config | Preview URL + prod secrets = full admin/API compromise |
| P2-MED-1 | MEDIUM | Dev script pattern calling `exec_sql` with anon | `scripts/list-tables.ts` | Reflects dangerous RPC if granted in DB |
| P2-MED-2 | MEDIUM | `DATABASE_URL` TLS `rejectUnauthorized: false` | `lib/pg.ts` | MITM on DB connection |
| P2-MED-3 | MEDIUM | Test/diagnostic pages routable in production build | `app/(settings)/test-connection`, `app/test-*` | Recon, Supabase connectivity probe |
| P2-MED-4 | MEDIUM | Wallet adjust verbose server logging | `app/api/admin/wallet/adjust/route.ts` | Sensitive ops in log platforms |
| P2-MED-5 | MEDIUM | Tracked `.tmp-*` migration/MCP artifacts | repo root `.tmp-*` | Accidental future secret commit |
| P2-LOW-1 | LOW | Public engine URL in client when flag on | `NEXT_PUBLIC_GAME_ENGINE_URL` | Reconnaissance |
| P2-LOW-2 | LOW | Develop Supabase project ref in tracked example | `.env.develop.local.example` | Environment mapping |
| P2-INFO-1 | INFO | No CI workflows in repo | — | Supply chain relies on external setup |
| P2-INFO-2 | INFO | No custom security headers/CSP in Next config | `next.config.mjs` | Depends on platform defaults |
| P2-INFO-3 | INFO | Anon key necessarily in bundle | `lib/supabase/env.ts` | By design; DB must enforce auth |
| P2-INFO-4 | INFO | `.env.local` gitignored; examples tracked | `.gitignore` | Good baseline |
| P2-INFO-5 | INFO | No `eyJ…` JWT in tracked files | `git grep` | No obvious committed tokens |

**Not observed as CRITICAL in Phase 2 repo scan:** committed `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` with password, or Upstash tokens in tracked source (local ignored files not scanned).

---

## 12. Phase 2 recommendations for Phase 3 (investigation only — not implemented)

1. Run **secret scanner** on full git history (`gitleaks`, GitHub secret scanning).
2. Confirm **Vercel Preview** env scopes (separate Supabase develop, no service role on previews).
3. Verify **production** `GAME_ENGINE_CORS_ORIGINS` and absence of `*`.
4. Add **deployment checklist**: never run `seed-winway-old-list-users.cjs` against prod; rotate if ever done.
5. Audit **Vercel project settings** for security headers and source maps.
6. Remove or gitignore **`.tmp-*`** artifacts; audit whether test routes should be **dev-only** or behind auth.
7. Confirm **Railway** env: `GAME_ENGINE_API`, Redis tokens, no public bind beyond load balancer.

---

## Appendix A — `NEXT_PUBLIC_*` checklist (for bundle reviews)

When adding env vars, only these patterns appear in client code today:

- Supabase URL + anon key  
- Game engine URL + use flags  
- Card pool cache flag  
- Origins / hosts for metadata and portal links  
- Active games source selector  

**Never prefix:** `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `UPSTASH_*`, `REDIS_URL`, `GAME_ENGINE_CORS_ORIGINS`.

---

## Appendix B — Files inspected (representative)

- `.gitignore`, `.env*.example`, `next.config.mjs`, `middleware.ts`, `package.json`
- `lib/supabaseServer.ts`, `lib/pg.ts`, `lib/supabase/env.ts`, `lib/gameEngine/config.ts`
- `game-engine/Dockerfile`, `game-engine/.env.example`, `game-engine/src/http/cors.ts`, `game-engine/src/config/env.ts`
- `scripts/seed-winway-old-list-users.cjs`, `scripts/list-tables.ts`
- `app/api/admin/wallet/adjust/route.ts`, `app/(settings)/test-connection/page.tsx`
- Git: `git ls-files`, `git grep eyJhbGci`, `git check-ignore`

---

*End of Phase 2 report.*
