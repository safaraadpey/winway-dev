# P2.0 — Batch 2 Low-Risk ACL Hardening

> **Date:** 2026-08-02  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Migration:** `sql/migrations/20260802120700_p2_0_batch2_acl.sql`  
> **Applied:** **YES** (Supabase MCP `apply_migration` → `p2_0_batch2_acl`)  
> **Commit / push:** **none**

---

## Status

```
P2_0_APPLIED_READY_FOR_MANUAL_TEST
```

---

## Applied scope (exactly 4)

| Function | Before ACL | After ACL | def MD5 | Mode | Owner |
|----------|------------|-----------|---------|------|-------|
| `public.fn_admin_games_report(...)` | PUBLIC+anon+auth+postgres+service | `{postgres=X/postgres,service_role=X/postgres}` | `9632e64043b48f162a36e205011a82b9` (unchanged) | DEFINER | postgres |
| `public.fn_generate_card_pool(...)` | same broad | `{postgres,service_role}` | `3cdcb972789739045cde9465f197044f` (unchanged) | DEFINER | postgres |
| `public.fn_adjust_wallet_manual(...)` | same broad | `{postgres,service_role}` | `eed739e18b40aa1a9c3edd62566bb052` (unchanged) | DEFINER | postgres |
| `public.fn_adjust_referral_wallet(...)` | same broad | `{postgres,service_role}` | `5749ff747fb044b5534c0e046cb13017` (unchanged) | DEFINER | postgres |

Privilege matrix (post): anon=false, authenticated=false, service_role=true, postgres=true for all four.

---

## Automated validation

| # | Check | Result |
|---|-------|--------|
| 1 | All 4 functions still exist | **PASS** |
| 2 | def MD5 / owner / signature / SECURITY DEFINER unchanged | **PASS** (4/4) |
| 3 | ACL exactly postgres + service_role | **PASS** (4/4) |
| 4 | Non-targets unchanged (`wallet_apply_delta`, `set_tournament_status`, transfer 5-arg, `fn_pick_admin_user`) | **PASS** |
| 5 | P1.14 create/update/delete ACL+MD5 unchanged | **PASS** |
| 5b | Batch 1 `debug_ticket_counts` `{postgres,service_role}` / md5 `d37fbeb0…` | **PASS** |
| 5c | P1.7 `fn_heartbeat_tick` `{postgres,service_role}` / md5 `91001c7b…` | **PASS** |
| 6 | Cron jobs 1,6,8,9 unchanged | **PASS** |
| 6b | Trigger `update_admin_permissions_updated_at` present | **PASS** |
| 7 | Railway `/health` | **PASS** `{"ok":true,"service":"game-engine","redis":"disabled"}` |
| 8 | `SET ROLE service_role` → games_report + generate_card_pool (not 42501) | **PASS** |
| 9 | `SET ROLE anon` / `authenticated` → `42501` on all four | **PASS** |
| 10 | No commit / push | **PASS** |

---

## Untouched (confirmed)

- `public.fn_wallet_apply_delta` — still broad ACL / md5 `572f2f9e…`
- `public.fn_admin_set_tournament_status` — still broad / md5 `862d1cc3…`
- `tournament.fn_pick_admin_user` — default ACL / md5 `20dcc9b9…`
- `public.fn_wallet_transfer_panel` 5-arg — still anon+auth+service
- App code / Railway / env / RLS / function bodies — not modified

---

## Operator manual smoke

- [ ] Admin games report page loads  
- [ ] Admin card-pool generate still works  
- [ ] Admin wallet adjust still works (`fn_wallet_apply_delta`)  

---

## Rollback SQL

See prior approval section in git history / previous draft; restore PUBLIC+anon+authenticated+postgres+service_role EXECUTE on the four functions if needed.

```sql
BEGIN;
GRANT EXECUTE ON FUNCTION public.fn_admin_games_report(timestamptz, timestamptz, integer, integer) TO PUBLIC, anon, authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_generate_card_pool(integer, uuid, text) TO PUBLIC, anon, authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_adjust_wallet_manual(uuid, numeric, text, transaction_type, text) TO PUBLIC, anon, authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_adjust_referral_wallet(uuid, numeric, text, transaction_type, text) TO PUBLIC, anon, authenticated, postgres, service_role;
COMMIT;
```

---

## Final status

**P2_0_APPLIED_READY_FOR_MANUAL_TEST**
