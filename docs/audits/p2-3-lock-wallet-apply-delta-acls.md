# P2.3 — Lock Wallet Apply Delta ACLs

> **Date:** 2026-08-02  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Migration:** `sql/migrations/20260802145200_p2_3_lock_wallet_apply_delta_acls.sql`  
> **Applied:** **YES** (Supabase MCP `apply_migration` → `p2_3_lock_wallet_apply_delta_acls`)  
> **Prior:** P2.2 `SAFE_TO_LOCK_WALLET_APPLY_DELTA`  
> **Commit / push:** **none**

---

## Status

```
P2_3_APPLIED_READY_FOR_MANUAL_TEST
```

---

## Pre-check (passed)

| Check | Result |
|-------|--------|
| Exact live signatures | Both: `(uuid, text, numeric, transaction_type, text, text, text, jsonb, boolean)` |
| Direct TS callers | Admin adjust + unused engine adapter — both **service_role** |
| Nested SQL parents | **11** parents, all **SECURITY DEFINER** / owner `postgres` |
| INVOKER parents | **0** |
| Pre ACL public | `{=X, postgres, anon, authenticated, service_role}` / md5 `572f2f9e…` |
| Pre ACL game_finance | `{=X, postgres, authenticated, service_role}` / md5 `23bac03a…` |

Nested DEFINER parents (unchanged by this migration):

- `game_finance.fn_distribute_ticket_commission`
- `game_finance.fn_finish_room_and_settle`
- `game_finance.fn_wallet_hold_join` (5-arg)
- `game_finance.fn_wallet_release_join` (5-arg)
- `public.fn_adjust_wallet_manual`
- `public.fn_tournament_wallet_hold` / `release`
- `tournament.fn_admin_refund_cancelled_tournament`
- `tournament.fn_payout_tournament`
- `tournament.fn_settle_commission_payouts`
- `tournament.fn_wallet_capture_join`

---

## Applied targets (exactly 2)

| Function | Before | After | def MD5 | Mode | Owner |
|----------|--------|-------|---------|------|-------|
| `public.fn_wallet_apply_delta(...)` | PUBLIC+anon+auth+service+postgres | `{postgres=X/postgres,service_role=X/postgres}` | `572f2f9ed827ebdb7486b6cf0f224881` **unchanged** | DEFINER | postgres |
| `game_finance.fn_wallet_apply_delta(...)` | PUBLIC+auth+service+postgres | `{postgres=X/postgres,service_role=X/postgres}` | `23bac03ac9ade0e537bdfbb4cad55dc8` **unchanged** | DEFINER | postgres |

Privilege matrix (post):

| Role | public | game_finance |
|------|--------|--------------|
| postgres | true | true |
| service_role | true | true |
| PUBLIC | false | false |
| anon | false | false |
| authenticated | false | false |

---

## Automated validation

| Check | Result |
|-------|--------|
| Both functions exist | **PASS** |
| Signatures / DEFINER / owner unchanged | **PASS** |
| Definition hashes unchanged | **PASS** |
| ACL exactly postgres + service_role | **PASS** |
| `SET ROLE anon` → `42501` both | **PASS** |
| `SET ROLE authenticated` → `42501` both | **PASS** |
| `SET ROLE service_role` → reaches body (not 42501; zero-amount rejects) | **PASS** |
| Non-targets unchanged (transfer, P1.14 create, P2.0 games_report/adjust_manual, tournament hold, heartbeat, debug_ticket_counts) | **PASS** |
| Parent EXECUTE still present (`fn_tournament_wallet_hold` auth=true; `fn_finish_room_and_settle` service=true) | **PASS** |
| Cron jobs 1/6/8/9 unchanged | **PASS** |
| Railway `/health` | **PASS** `{"ok":true,"service":"game-engine","redis":"disabled"}` |

**Not claimed (operator manual smoke):**

- [ ] Admin wallet adjustment (`POST /api/admin/wallet/adjust`)
- [ ] Player ticket purchase / join hold
- [ ] Tournament wallet hold / release
- [ ] Room settlement + commission distribution

---

## Rollback SQL

```sql
BEGIN;

GRANT EXECUTE ON FUNCTION public.fn_wallet_apply_delta(uuid, text, numeric, transaction_type, text, text, text, jsonb, boolean)
  TO PUBLIC, anon, authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION game_finance.fn_wallet_apply_delta(uuid, text, numeric, transaction_type, text, text, text, jsonb, boolean)
  TO PUBLIC, authenticated, postgres, service_role;
-- (pre-state also had PUBLIC on game_finance; anon via PUBLIC)

COMMIT;
```

---

## Final status

**P2_3_APPLIED_READY_FOR_MANUAL_TEST**
