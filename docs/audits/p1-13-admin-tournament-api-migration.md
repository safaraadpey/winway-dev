# P1.13 — Admin Tournament Mutations Behind Next.js API

**Date:** 2026-07-31  
**Project:** Ding Money / winway-dev  
**Scope:** Move create/update/delete tournament mutations from browser Supabase RPC to authenticated Next.js Admin API.  
**Out of scope:** ACL changes, REVOKE/GRANT, SQL body edits, schema, Railway, cron, player flows, `fn_admin_set_tournament_status`.

**Final status:** `P1_13_READY_FOR_MANUAL_TEST`

---

## Summary

Admin create/update/delete tournament calls no longer hit Supabase RPC from the browser. They go:

```
Admin Browser (Bearer JWT)
  → Next.js /api/admin/tournaments[+/:id]
  → session verify + public.users role/status (service_role read)
  → RPC via caller JWT (auth.uid() for nested SQL)
  → public.fn_admin_* → tournament.fn_admin_*
```

Database ACLs were **not** changed.

---

## Old direct browser call sites

| File | RPC | Action |
|------|-----|--------|
| `app/admin/tournaments/create/page.tsx` | `fn_admin_create_tournament` | Replaced with `POST /api/admin/tournaments` |
| `app/admin/tournaments/[id]/edit/page.tsx` | `fn_admin_update_tournament` | Replaced with `PATCH /api/admin/tournaments/[id]` |
| `app/admin/tournaments/[id]/edit/page.tsx` | `fn_admin_delete_tournament` | Replaced with `DELETE /api/admin/tournaments/[id]` |

Repo-wide search of `app/**/*.{ts,tsx}` for `.rpc("fn_admin_{create,update,delete}_tournament"`: **zero browser callers remain**. Only the new API route files call these RPCs.

**Left unchanged (out of scope):** browser `.rpc("fn_admin_set_tournament_status", …)` on the edit page.

---

## New API routes

| Method | Path | File | RPC |
|--------|------|------|-----|
| `POST` | `/api/admin/tournaments` | `app/api/admin/tournaments/route.ts` | `fn_admin_create_tournament` |
| `PATCH` | `/api/admin/tournaments/[id]` | `app/api/admin/tournaments/[id]/route.ts` | `fn_admin_update_tournament` |
| `DELETE` | `/api/admin/tournaments/[id]` | `app/api/admin/tournaments/[id]/route.ts` | `fn_admin_delete_tournament` |

Existing `GET /api/admin/tournaments/report` was not modified.

---

## Authorization rules

### Allowed roles / status (exact)

| Rule | Value | Evidence |
|------|--------|----------|
| Roles | **`admin`**, **`super` only** | Live `tournament.fn_admin_{create,update,delete}_tournament`: `IF v_actor_role NOT IN ('admin','super') … RAISE EXCEPTION 'FORBIDDEN'` |
| Account status | **`active`** | Same functions: `OR v_actor_status IS DISTINCT FROM 'active'` → `FORBIDDEN` |
| Auth actor | `auth.uid()` must be non-null | Same functions: null actor → `UNAUTHORIZED` |
| **Not** allowed | `agent`, player, suspended/inactive | SQL rejects; API also rejects before RPC |

Evidence sources:

- Live DEV function bodies (`tournament.fn_admin_*`) via Supabase MCP `execute_sql` / `pg_get_functiondef`
- Historical migration `sql/migrations/20251231113000_lock_tournament_admin_writes.sql`

### API enforcement (does not trust browser-supplied role)

1. `getAdminJwtContextOrThrow(request)` — Bearer JWT required; missing/invalid → **401**.
2. Re-load `public.users.role` + `public.users.status` with **service_role** (SoR metadata read).
3. Allow only `admin|super` **and** `status === 'active'`; else **403**.
4. Role is **never** taken from request JSON.

Note: `getAdminJwtContextOrThrow` itself allows `admin|super|agent` for other admin APIs. Tournament routes **narrow** to `admin|super` + `active` to match tournament SQL exactly. Agents receive **403** at the API layer.

### RPC client choice (auth.uid compatibility)

Preferred architecture diagram said “service_role → Supabase RPC”. Nested SQL **requires** `auth.uid()` of the admin actor. A bare service_role client would yield `auth.uid() IS NULL` → `UNAUTHORIZED` without changing SQL (forbidden in this task).

**Implementation (matches wallet transfer pattern):** after authorization, call RPCs with `createUserClientFromAccessToken(accessToken)` so DB `auth.uid()` equals the verified admin. Service_role is used for role/status lookup and `logAdminAction` audit rows only.

---

## Input validation

### Create (`POST`)

- JSON body required.
- Accepts `{ payload: TournamentFormValues }` or a bare object payload.
- Rejects non-object / missing payload (**400**).
- Requires non-empty trimmed `title` (**400**).
- Remaining field semantics left to SQL (defaults / business rules unchanged).

### Update (`PATCH`)

- Path `id` must be UUID (**400** if invalid).
- Accepts `{ patch: … }` or bare patch object.
- Rejects empty / non-object patch (**400**).
- Payload keys match prior browser patch shape (title, start_at, currency, ticket fields, table sizing, commission, guaranteed_prize, meta.*).

### Delete (`DELETE`)

- Path `id` must be UUID (**400** if invalid).
- Deletion safeguards remain in SQL (e.g. cancelled-only UX still enforced in UI; DB errors mapped).

### Error mapping

| DB signal | HTTP |
|-----------|------|
| unauthorized | 401 |
| forbidden | 403 |
| not found | 404 |
| invalid / must be / not allowed / locked / … | 400 |
| other | 500 with generic message (no stack traces) |

Audit: `logAdminAction` with actions `tournament_create` / `tournament_update` / `tournament_delete`; logs use `[TournamentAdmin]` prefix (no secrets / full payloads).

---

## Client files changed

| File | Change |
|------|--------|
| `app/admin/tournaments/create/page.tsx` | `fetch POST /api/admin/tournaments` + Bearer session token |
| `app/admin/tournaments/[id]/edit/page.tsx` | `fetch PATCH/DELETE /api/admin/tournaments/[id]` + Bearer; status RPC unchanged |

UX preserved: alerts/errors, redirects to `/admin/tournaments`, submitting/deleting flags, form behavior.

---

## Server files created/changed

| File | Status |
|------|--------|
| `app/api/admin/tournaments/route.ts` | **Created** (POST) |
| `app/api/admin/tournaments/[id]/route.ts` | **Created** (PATCH, DELETE) |

No ACL migrations. No SQL changes. `lib/supabaseServer.ts` unchanged (reused helpers).

---

## Remaining references to the three RPC names

| Category | Count / notes |
|----------|----------------|
| Browser `.rpc` callers (`app/**` Client Components) | **0** |
| Next.js Admin API server routes | **3** (create/update/delete) |
| SQL migrations | Historical definitions (unchanged) |
| Docs / audits (P1.8–P1.12, system-map) | Documentation only |
| Generated types | N/A / not browser callers |

---

## Build / lint / typecheck

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (routes listed: `/api/admin/tournaments`, `/api/admin/tournaments/[id]`) |
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npm run lint` | **SKIPPED** — `next lint` prompted interactive ESLint setup (no non-interactive config); IDE diagnostics on changed files: clean |

---

## Automated authorization / migration checks

Structural Node validation (no live tokens):

| Check | Result |
|-------|--------|
| Zero browser `.rpc` for the three RPCs under `app/` + `lib/` | **PASS** |
| API routes restrict roles to `admin`/`super` | **PASS** |
| API routes require `status === 'active'` | **PASS** |
| RPC invoked via `createUserClientFromAccessToken` | **PASS** |
| Role not read from request body | **PASS** |
| Create/edit pages use `/api/admin/tournaments` fetch | **PASS** |

Live HTTP matrix (401/403/success) was **not** executed in this session (requires operator tokens / running app). See checklist below.

---

## Operator manual-test checklist

1. [ ] Unauthenticated `POST /api/admin/tournaments` → **401**
2. [ ] Normal player Bearer → **403**
3. [ ] `agent` (active) Bearer → **403**
4. [ ] Inactive/suspended admin Bearer → **403**
5. [ ] Active `admin` or `super` → create succeeds (**201**), row appears in list
6. [ ] Same → update succeeds; form values persist
7. [ ] Cancelled tournament → delete succeeds; redirects to list
8. [ ] Malformed create body / empty title → **400**
9. [ ] Invalid UUID in path → **400**
10. [ ] Admin UI create/edit/delete UX matches prior behavior (loading, errors, redirects)
11. [ ] Status buttons still work via existing browser RPC `fn_admin_set_tournament_status` (unchanged)

---

## Git status / diff (relevant)

```
 M app/admin/tournaments/[id]/edit/page.tsx
 M app/admin/tournaments/create/page.tsx
?? app/api/admin/tournaments/[id]/
?? app/api/admin/tournaments/route.ts
?? docs/audits/p1-13-admin-tournament-api-migration.md
```

`git diff --stat` (client pages):

```
 app/admin/tournaments/[id]/edit/page.tsx | 52 ++++++++++++++++++++++++--------
 app/admin/tournaments/create/page.tsx    | 24 ++++++++++++---
 2 files changed, 59 insertions(+), 17 deletions(-)
```

(New API route files are untracked until staged.)

**No commit / no push** (per task boundaries).

---

## ACL note (next phase)

Browser callers are removed. ACLs for `public.fn_admin_{create,update,delete}_tournament` remain broad until a follow-up REVOKE/GRANT task (not P1.13).

---

## Final status

**P1_13_READY_FOR_MANUAL_TEST**
