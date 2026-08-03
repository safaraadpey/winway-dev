# P5.4 — Platform Session Shadow Mode

> **Phase:** P5.4 — Shadow Mode (Platform WRITE ONLY)  
> **Date:** 2026-08-03  
> **Migration (repo):** `sql/migrations/20260803052140_p5_4_platform_shadow_mode.sql`  
> **Applied on DEV:** via MCP apply_migration chunks (`p5_4_shadow_*`)  
> **Design:** [p5-3-bingo-platform-adapter.md](./p5-3-bingo-platform-adapter.md)

## Status

| Item | Result |
|------|--------|
| Bingo / wallet / settle / tournament RPCs | **Unchanged** (enqueue trigger only) |
| Platform reads in production | **None** (WRITE ONLY) |
| Identity | `game_sessions.id = rooms.id` |
| Initial mirror | **47/47 rooms** |
| Lifecycle divergence | **0** |
| Duplicate sessions | **0** |
| Settlement timestamp mismatch | **0** |
| Pending outbox / DLQ | **0 / 0** |

---

## 1. Mirror architecture

```text
public.rooms INSERT/UPDATE (status|lease|card_price)
        │
        ▼
trg_rooms_platform_shadow
        │  EXCEPTION swallowed — Bingo txn never fails for Platform
        ▼
platform.fn_shadow_enqueue(room_id)
        │  coalesce pending per room
        ▼
platform.shadow_outbox
        │
        ├─ cron platform_shadow_drain (10 seconds)
        │         ▼
        │  platform.fn_shadow_drain → fn_shadow_mirror_room
        │         ▼
        │  platform.game_sessions / session_state /
        │  session_settlement / session_events
        │  + platform.shadow_mirror_log + RAISE LOG [PlatformShadow]
        │
        └─ cron platform_shadow_reconcile (* * * * *)
                  heals missing/diverged rooms → enqueue → drain
```

**Bingo remains source of truth.** Mirror applies a **snapshot** from `rooms` (idempotent upsert). Platform failure never rolls back Bingo, wallet, or settlement.

---

## 2. Lifecycle mapping

| Bingo `rooms.status` | Platform `game_sessions.status` |
|----------------------|---------------------------------|
| waiting (no lease) | waiting |
| waiting + `engine_owner_id` | claimed |
| playing / live | running |
| settling | finished |
| finished | settled (+ settlement row) |
| cancelled | cancelled |
| idle | archived |

---

## 3. Logging strategy

| Channel | Content |
|---------|---------|
| `platform.shadow_mirror_log` | room_id, session_id, lifecycle, result, retry_count, duration_ms, detail |
| `RAISE LOG` / `WARNING` | Prefix **`[PlatformShadow]`** — room_id, session_id, lifecycle, result, retry, duration_ms |
| Dead letter | outbox `dead_lettered_at` + WARNING |

No application code reads Platform.

---

## 4. Retry strategy

| Property | Behavior |
|----------|----------|
| Delivery | At-least-once via outbox |
| Idempotency | Shared UUID upsert; settlement_key `bingo.settle:<room_id>`; event seq unique |
| Duplicate enqueue | Coalesced if pending row exists |
| Backoff | `min(300, 2^retry)` seconds |
| Max retries | 25 → DLQ |
| Heal | Reconcile cron compares Bingo vs Platform and re-enqueues |

**Never** rollback Bingo. **Never** block settle/wallet.

---

## 5. Validation report (DEV 2026-08-03)

| Check | Result |
|-------|--------|
| rooms | 47 |
| mirrored `bingo.room:%` sessions | 47 |
| missing sessions | 0 |
| lifecycle divergence | 0 |
| duplicate sessions | 0 |
| finished → settled + `settled_at`/`applied_at` = `rooms.updated_at` | 0 mismatches |
| mirror_ok / mirror_err | 47 / 0 |
| pending outbox / DLQ | 0 / 0 |
| trigger `trg_rooms_platform_shadow` | present |
| crons active | `platform_shadow_drain` (10s), `platform_shadow_reconcile` (minutely) |

Status distribution observed:

| Bingo | Platform | Count |
|-------|----------|-------|
| finished | settled | 28 |
| cancelled | cancelled | 19 |

**Note:** No live `waiting`/`playing` rooms were present at validation time. Historical rooms fully mirrored. Live multi-game verification: run Bingo games and confirm new rooms appear in `platform.game_sessions` with matching lifecycle (Platform still WRITE ONLY — ops/SQL checks only).

### Compatibility

| Surface | Impact |
|---------|--------|
| Existing RPC bodies | Unchanged |
| API behavior | Unchanged |
| Wallet / settlement / tournament | Unchanged |
| Financial amounts | Unchanged |
| Production Platform reads | Not introduced |

---

## 6. Rollback plan

```sql
SELECT cron.unschedule('platform_shadow_drain');
SELECT cron.unschedule('platform_shadow_reconcile');
DROP TRIGGER IF EXISTS trg_rooms_platform_shadow ON public.rooms;
DROP FUNCTION IF EXISTS platform.trg_rooms_platform_shadow();
DROP FUNCTION IF EXISTS platform.fn_shadow_drain(integer);
DROP FUNCTION IF EXISTS platform.fn_shadow_reconcile(integer);
DROP FUNCTION IF EXISTS platform.fn_shadow_mirror_room(uuid, integer);
DROP FUNCTION IF EXISTS platform.fn_shadow_enqueue(uuid);
DROP FUNCTION IF EXISTS platform.fn_shadow_map_lifecycle(text, text);
DROP FUNCTION IF EXISTS platform.fn_shadow_bingo_ids();
DROP TABLE IF EXISTS platform.shadow_outbox;
DROP TABLE IF EXISTS platform.shadow_mirror_log;
-- Optional projection cleanup:
-- DELETE FROM platform.session_events WHERE session_id IN (SELECT id FROM public.rooms);
-- DELETE FROM platform.session_settlement WHERE session_id IN (SELECT id FROM public.rooms);
-- DELETE FROM platform.session_state WHERE session_id IN (SELECT id FROM public.rooms);
-- DELETE FROM platform.game_sessions WHERE correlation_key LIKE 'bingo.room:%';
```

Rollback does **not** modify Bingo rooms, wallets, or settle RPCs.

---

## 7. Explicit non-goals (still)

- Reading Platform in app/API  
- Dual-write control plane (Platform → Bingo)  
- Replacing Bingo settle with Platform settle  
- Connecting tournaments to `game_sessions`  

---

## Related

- [p5-2-platform-foundation.md](./p5-2-platform-foundation.md)  
- [p5-3-sync-lifecycle.md](./p5-3-sync-lifecycle.md)  
- [p5-3-session-mapping.md](./p5-3-session-mapping.md)  
