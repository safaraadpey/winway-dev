# P1.15 — Admin & Agent RPC Security Audit (Read-Only)

> **Date:** 2026-07-31  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Mode:** Read-only (no SQL / ACL / app / migrations / commit / push)  
> **Prior:** P1.10 trust boundary · P1.11–P1.14 admin tournament API + ACL  
> **Companion CSV:** [`p1-15-admin-agent-rpc-audit.csv`](./p1-15-admin-agent-rpc-audit.csv)

---

## Status

```
P1_15_AUDIT_COMPLETE
```

---

## Scope

RPCs that are **admin / super / agent panel–relevant** (by name, finance panel use, dashboard admin summaries, card-pool admin, or SQL role gates mentioning `admin`/`super`/`agent`), plus nested `tournament.fn_admin_*` callees.

**In scope:** **26** function signatures  
**Out of scope:** pure player RPCs, Batch 0/P1.7/P1.12 engine locks (except where also admin entrypoints), Railway commission/settle internals that are not panel RPCs

### Evidence sources

1. Live `pg_proc` / `proacl` / `has_function_privilege` (Supabase MCP)  
2. Live `pg_get_functiondef` role gates  
3. Repo `.rpc(` scan (`app/`, `lib/`, `services/`, `apps/engines/bingo/`)  
4. P1.13/P1.14 outcomes for tournament create/update/delete

---

## Summary totals

| Category | Count |
|----------|------:|
| **CLIENT_RPC** | **5** |
| **SERVER_RPC** | **15** |
| **HYBRID_RPC** | **3** |
| **UNSAFE_RPC** | **3** |
| **Total audited** | **26** |
| **API migration candidates** | **5** (primary) + 2 orphan cleanup |
| **Batch 2 ACL candidates (YES)** | **8** |

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **CLIENT_RPC** | Browser still calls with user JWT (or intended for direct authenticated PostgREST) |
| **SERVER_RPC** | Callers are Admin API / Railway / trigger / SQL-only; no live browser `.rpc` |
| **HYBRID_RPC** | Productive callers on **both** browser and server paths, or public+schema finance dual entry |
| **UNSAFE_RPC** | Privileged DEFINER + **no/weak SQL AuthZ** + still executable by **anon** (or equivalent PUBLIC exposure) |

AuthZ quality: **STRONG** (auth.uid + role gate) · **PARTIAL** (wrapper none / nested strong) · **NONE** · **N/A** (trigger stamp)

---

## CLIENT_RPC (5)

| Function | Roles (SQL) | Callers | ACL highlight | AuthZ | Move to API? | Batch2 ACL? | Risk |
|----------|-------------|---------|---------------|-------|--------------|-------------|------|
| `public.fn_admin_set_tournament_status` | **admin, super** + active | **BROWSER** edit page | PUBLIC+anon+auth+service | STRONG | **YES** (P1.13 follow-on) | After API move | **High** |
| `public.fn_dashboard_admin_commission_summary_range` | **admin** only | **BROWSER** `services/dashboard.ts` | anon+auth+service | STRONG | **YES** | After browser removed | Medium |
| `public.fn_dashboard_admin_tournament_guarantee_summary_range` | **admin** only | **BROWSER** `services/dashboard.ts` | anon+auth+service | STRONG | **YES** | After browser removed | Medium |
| `public.fn_adjust_wallet_manual` | **admin, agent, super** | **none** (orphan; adjust uses `fn_wallet_apply_delta`) | PUBLIC+anon+auth+service | STRONG | N/A (dead path) | **YES** lock or deprecate | **High** |
| `public.fn_adjust_referral_wallet` | **admin, agent, super** | **none** | PUBLIC+anon+auth+service | STRONG | N/A | **YES** lock or deprecate | **High** |

---

## SERVER_RPC (15)

| Function | Roles (SQL) | Callers | ACL highlight | AuthZ | Move to API? | Batch2 ACL? | Risk |
|----------|-------------|---------|---------------|-------|--------------|-------------|------|
| `public.fn_admin_create_tournament` | nested **admin/super**+active | **API** JWT (P1.13) | auth+service+postgres (**no anon** P1.14) | PARTIAL (wrapper) | Done | No (keep `authenticated`) | Medium |
| `public.fn_admin_update_tournament` | nested admin/super | **API** JWT | same | PARTIAL | Done | No | Medium |
| `public.fn_admin_delete_tournament` | nested admin/super | **API** JWT | same | PARTIAL | Done | No | Medium |
| `public.fn_wallet_transfer_panel` `(uuid,bigint,text,text,jsonb)` | **admin, super, agent** + hierarchy | **API** JWT | anon+auth+service | STRONG | Done | Soft: revoke PUBLIC/anon only | Medium |
| `public.fn_wallet_transfer_panel` `(uuid,text,bigint,text,text)` | via bulk | **none** (legacy shim) | PUBLIC+anon+auth+service | NONE (shim) | Deprecate | **YES** | Medium |
| `public.fn_wallet_transfer_panel_bulk` | **admin, super, agent** | **none** (API loops 5-arg) | PUBLIC+anon+auth+service | STRONG | Optional | Soft revoke anon | Medium |
| `game_core.fn_generate_card_pool` | none | nested / API path | postgres+service (**locked**) | NONE | N/A | Already locked | Low |
| `tournament.fn_admin_create_tournament` | admin/super+active | nested from public / JWT | PUBLIC+auth | STRONG | N/A | Soft revoke PUBLIC | Medium |
| `tournament.fn_admin_update_tournament` | admin/super+active | nested | PUBLIC+auth | STRONG | N/A | Soft revoke PUBLIC | Medium |
| `tournament.fn_admin_delete_tournament` | admin/super+active | nested | PUBLIC+auth | STRONG | N/A | Soft revoke PUBLIC | Medium |
| `tournament.fn_admin_set_tournament_status` | admin/super+active | nested / parallel to public | PUBLIC+auth | STRONG | With public status API move | Soft revoke PUBLIC | Medium |
| `tournament.fn_admin_refund_cancelled_tournament` | admin/super+active | **none** app; SQL-only | **default** (PUBLIC-like) | STRONG | If UI needs refund | Soft lock | Medium |
| `tournament.fn_pick_admin_user` | picks `admin` rows; **no caller AuthZ** | SQL helper | default PUBLIC | **NONE** | N/A | **YES** | Medium |
| `public.update_admin_permissions_updated_at` | N/A | **TRIGGER** on `admin_permissions` | PUBLIC+anon+auth+service | N/A | N/A | **YES** | Low |
| `public.is_admin_active` | returns true only for **admin**+active | no TS `.rpc`; helper | PUBLIC+anon+auth+service | STRONG | No | Soft revoke anon | Low |

---

## HYBRID_RPC (3)

| Function | Roles | Callers | AuthZ | Notes | Risk |
|----------|-------|---------|-------|-------|------|
| `public.fn_dashboard_admin_commission_summary` | **admin** | **BROWSER** + **API** snapshot lib | STRONG | Snapshot API exists; browser path still live | Medium |
| `public.fn_dashboard_admin_tournament_guarantee_summary` | **admin** | **BROWSER** + **API** | STRONG | Same | Medium |
| `public.fn_wallet_apply_delta` | **NONE** (finance primitive) | **API** adjust (service_role) + **RAILWAY** | NONE | Keep service_role; revoke anon ASAP | **Critical** |

*(Related: `game_finance.fn_wallet_apply_delta` — nested SoR; PUBLIC+auth+service; classify with hybrid finance surface — counted under UNSAFE below if exposed.)*

---

## UNSAFE_RPC (3)

Privileged, weak/no SQL AuthZ, **anon can EXECUTE** today:

| Function | Why unsafe | Callers | Batch2? | Risk |
|----------|------------|---------|---------|------|
| `public.fn_admin_games_report` | DEFINER report; **no** auth.uid/role; anon EXECUTE | API service_role only | **YES** | High |
| `public.fn_generate_card_pool` | DEFINER pool gen; no AuthZ; anon EXECUTE | API service_role | **YES** | High |
| `game_finance.fn_wallet_apply_delta` | Core wallet mutation; no AuthZ; PUBLIC EXECUTE | Nested + service | **YES** (careful; keep service_role; drop PUBLIC) | **Critical** |

`public.fn_wallet_apply_delta` is the public shim (also NONE + anon) — treated as **HYBRID** for caller topology but **Critical** risk; ACL harden with finance Batch 2.

---

## API migration candidates

### Primary (do next)

1. **`fn_admin_set_tournament_status`** — last tournament admin **browser** RPC; mirror P1.13 (`PATCH` status or dedicated route).  
2. **`fn_dashboard_admin_*_range`** (commission + guarantee) — still browser-only via `services/dashboard.ts`.  
3. **Remove browser `.rpc` for non-range dashboard summaries** — force `/api/admin/dashboard/snapshot` only (already HYBRID).

### Secondary / cleanup

4. Confirm **`fn_adjust_wallet_manual` / `fn_adjust_referral_wallet`** unused → ACL lock or drop.  
5. Legacy **`fn_wallet_transfer_panel(uuid,text,bigint,text,text)`** shim + unused **bulk** entry — deprecate after confirming no clients.

**Already behind Next.js Admin API (no migration needed):** create/update/delete tournament, wallet transfer (5-arg), wallet adjust, games report, card-pool generate, dashboard snapshot (non-range).

---

## Batch 2 ACL candidates

**YES — ready** (no authenticated browser product need; API/Railway already service_role or trigger/SQL-only):

| # | Function | Target ACL (recommended) |
|---|----------|---------------------------|
| 1 | `public.fn_admin_games_report` | postgres + service_role |
| 2 | `public.fn_generate_card_pool` | postgres + service_role |
| 3 | `public.update_admin_permissions_updated_at` | postgres (+ service_role optional) |
| 4 | `tournament.fn_pick_admin_user` | postgres + service_role |
| 5 | `public.fn_adjust_wallet_manual` | postgres + service_role (or drop) |
| 6 | `public.fn_adjust_referral_wallet` | postgres + service_role (or drop) |
| 7 | `public.fn_wallet_transfer_panel` legacy `(uuid,text,bigint,text,text)` | postgres + service_role |
| 8 | `game_finance.fn_wallet_apply_delta` | revoke PUBLIC; keep postgres + service_role (+ auth only if proven needed) |

**SOFT / after API migration** (keep `authenticated` until then):

- `public.fn_admin_set_tournament_status` → then P1.14-style (auth+service+postgres, no anon) or service-only if switched to service_role pattern  
- Dashboard `fn_dashboard_admin_*` → revoke anon; keep authenticated until browser gone, then service_role-only if snapshot uses service  
- `public.fn_wallet_transfer_panel` 5-arg → revoke PUBLIC/anon only  
- `tournament.fn_admin_*` → revoke PUBLIC (anon via PUBLIC today)

**NO — do not revoke `authenticated` yet:**

- `public.fn_admin_{create,update,delete}_tournament` (P1.13 JWT)  
- `public.fn_wallet_transfer_panel` 5-arg (JWT)  
- Live dashboard RPCs while browser path exists  

---

## Notable role matrix (SQL)

| Capability | admin | super | agent | status |
|------------|:-----:|:-----:|:-----:|--------|
| Tournament create/update/delete/status/refund | ✓ | ✓ | ✗ | active |
| Wallet transfer panel / adjust_* | ✓ | ✓ | ✓ | (transfer: hierarchy) |
| Dashboard admin summaries | ✓ | ✗ | ✗ | — |
| Games report (SQL) | — | — | — | **API only** (admin/super/agent) |
| `is_admin_active` | ✓ only | ✗ | ✗ | active |

---

## Residual risks (post P1.13/P1.14)

1. **Status still browser-callable** + anon EXECUTE on public set-status.  
2. **Games report / public card-pool / wallet_apply_delta** — AuthZ only at API; DB allows anon EXECUTE.  
3. **Dashboard dual path** — snapshot API + `services/dashboard.ts` browser RPC.  
4. **Orphan adjust_* with STRONG AuthZ but broad ACL** — any authenticated admin-family JWT can still call; anon hits AuthZ failure after EXECUTE.  
5. **Tournament schema PUBLIC** — `has_function_privilege(anon)=true` via PUBLIC on nested admin fns.

---

## Recommended sequencing

1. Migrate **`fn_admin_set_tournament_status`** behind Admin API → ACL like P1.14.  
2. Batch 2 ACL: **games_report**, **public.fn_generate_card_pool**, **orphans**, **pick_admin_user**, trigger stamp; carefully **wallet_apply_delta** PUBLIC revoke.  
3. Kill browser dashboard RPCs → then ACL-harden dashboard functions.  
4. Revoke **PUBLIC** on `tournament.fn_admin_*`.

---

## Final status

**P1_15_AUDIT_COMPLETE**
