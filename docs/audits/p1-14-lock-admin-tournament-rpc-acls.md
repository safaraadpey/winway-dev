# P1.14 — Lock Admin Tournament RPC ACLs

> **Date:** 2026-07-31  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Migration:** `sql/migrations/20260731174930_p1_14_lock_admin_tournament_rpc_acls.sql`  
> **Applied:** **YES** (Supabase MCP `apply_migration` → `p1_14_lock_admin_tournament_rpc_acls`)  
> **Prerequisite:** P1.13 Admin API migration (browser no longer calls these RPCs)  
> **Commit / push:** **none**

---

## Status

```
P1_14_READY_FOR_MANUAL_TEST
```

- Scope: **ACL REVOKE/GRANT only** on three `public` wrappers  
- Function bodies / signatures / SECURITY DEFINER / owners: **unchanged**  
- Railway / cron / triggers / RLS / app code: **unchanged**

---

## Targets

| Function | Before `proacl` | After `proacl` | def MD5 |
|----------|-----------------|----------------|---------|
| `public.fn_admin_create_tournament(jsonb)` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | `12bce5e92cdae7d82aedf52d4528d31b` (unchanged) |
| `public.fn_admin_update_tournament(uuid, jsonb)` | same broad pattern | `{postgres,authenticated,service_role}` | `5bf950b1a602f9ca3678633c8b03bfe2` (unchanged) |
| `public.fn_admin_delete_tournament(uuid)` | same broad pattern | `{postgres,authenticated,service_role}` | `285a4f84d184150e8eae329bf5a2be1e` (unchanged) |

### ACL policy applied

| Grantee | Action |
|---------|--------|
| `PUBLIC` | **REVOKE ALL** |
| `anon` | **REVOKE ALL** |
| `authenticated` | **KEEP / GRANT EXECUTE** |
| `service_role` | **KEEP / GRANT EXECUTE** |
| `postgres` | **KEEP / GRANT EXECUTE** |

### Privilege matrix (post)

| Role | create | update | delete |
|------|--------|--------|--------|
| `anon` | false | false | false |
| `authenticated` | true | true | true |
| `service_role` | true | true | true |
| `postgres` | true | true | true |

`prosecdef = true`, owner `postgres` — unchanged for all three.

---

## Why `authenticated` EXECUTE is kept

P1.13 Admin API calls these RPCs with the **caller JWT** (`createUserClientFromAccessToken`) so nested `tournament.fn_admin_*` sees `auth.uid()`. That uses the PostgREST/`authenticated` role. Revoking `authenticated` would break admin create/update/delete without SQL body changes (out of scope).

Authorization for non-admins remains in SQL: only `admin`/`super` with `status = active` pass; others get `FORBIDDEN` / `UNAUTHORIZED`.

---

## Explicitly not modified

| Item | Notes |
|------|--------|
| `tournament.fn_admin_{create,update,delete}_tournament` | Nested callees; ACL left as `{=X/postgres,postgres=X/postgres,authenticated=X/postgres}` (still has PUBLIC). Not PostgREST entry used by P1.13 Admin UI. |
| SQL function bodies | MD5 unchanged |
| App / Railway / cron / triggers / RLS | Untouched |
| Other RPCs (P1.7 / Batch 0 / P1.12 / wallet) | Untouched |

---

## Automated validation

| Check | Result |
|-------|--------|
| Migration apply | **PASS** |
| Post ACL = postgres + authenticated + service_role only | **PASS** (3/3) |
| No PUBLIC / no anon EXECUTE | **PASS** (`has_function_privilege` false for anon) |
| `SET ROLE anon` → create/update/delete | **PASS** `42501 insufficient_privilege` |
| `authenticated` retains EXECUTE | **PASS** |
| def MD5 / SECURITY DEFINER / owner | **PASS** unchanged |
| `tournament.*` ACL / MD5 | **PASS** unchanged (not in migration) |

### Manual (operator) — not claimed done here

1. Active `admin`/`super` → create tournament via Admin UI / `POST /api/admin/tournaments`  
2. Same → update via `PATCH`  
3. Cancelled tournament → delete via `DELETE`  
4. Normal player JWT calling RPC or API → denied (**403** API / SQL `FORBIDDEN`)  
5. Confirm anon/PostgREST without JWT cannot EXECUTE these three public RPCs

---

## Operator checklist

- [ ] Admin create still works  
- [ ] Admin update still works  
- [ ] Admin delete still works  
- [ ] Player / non-admin authenticated cannot mutate  
- [ ] ACL matrix matches table above  

---

## Artifacts

| Path | Role |
|------|------|
| `sql/migrations/20260731174930_p1_14_lock_admin_tournament_rpc_acls.sql` | Migration (also applied on DEV) |
| `docs/audits/p1-14-lock-admin-tournament-rpc-acls.md` | This report |

```
?? sql/migrations/20260731174930_p1_14_lock_admin_tournament_rpc_acls.sql
?? docs/audits/p1-14-lock-admin-tournament-rpc-acls.md
```

---

## Final status

**P1_14_READY_FOR_MANUAL_TEST**
