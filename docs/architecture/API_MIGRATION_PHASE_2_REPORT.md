# API Migration Phase 2 Report

> Date: 2026-07-05  
> Scope: Live-room polling — `GET /api/player/live-room` → Railway `GET /v1/live-room`  
> Feature flag: `NEXT_PUBLIC_USE_GAME_ENGINE` + `NEXT_PUBLIC_GAME_ENGINE_URL`

---

## Summary

Phase 2 migrates the **highest-frequency player poll** (live-room draw sync + full snapshot fallback) from Vercel to the Game Engine, with **PG-first parity** matching the existing Next.js route.

When the flag is on, `fetchLiveRoomSnapshot()` calls Railway first; on error, timeout, or invalid payload it falls back to the unchanged Vercel route.

---

## Files Changed

### Game Engine (Railway)

| File | Change |
|------|--------|
| `apps/engines/bingo/src/db/pg.ts` | **New** — `pg` pool from `DATABASE_URL` |
| `apps/engines/bingo/src/http/live-room-snapshot-pg.ts` | **New** — PG loaders + card builders (mirrors `lib/liveRoomSnapshotPg.ts`) |
| `apps/engines/bingo/src/http/live-room-view.ts` | **New** — full snapshot builder (mirrors `app/api/player/live-room/route.ts`) |
| `apps/engines/bingo/src/http/commands.ts` | Added `getLiveRoom()` |
| `apps/engines/bingo/src/http/server.ts` | Added `GET /v1/live-room` |
| `apps/engines/bingo/src/index.ts` | Logs `databaseUrl: configured|missing` at startup |
| `apps/engines/bingo/package.json` | Added `pg`, `@types/pg` |

### Frontend (Next.js)

| File | Change |
|------|--------|
| `lib/gameEngineClient.ts` | Added `getLiveRoom()`, `LiveRoomEngineResponse`, payload validation, 12s timeout |
| `services/rooms.ts` | `fetchLiveRoomSnapshot()` routes through engine when flag on |

### Documentation

| File | Change |
|------|--------|
| `README.md` | Railway env vars for Phase 2 |

### Not changed (by design)

- `app/api/player/live-room/route.ts` — **kept** as fallback
- `lib/liveRoomSnapshotPg.ts` — still used by Vercel route
- Wallet, tournament, admin, leaderboard, menu counts, room results
- UI components (`LiveRoomScreen` unchanged — still calls `fetchLiveRoomSnapshot`)

---

## Old Request Flow

```
Browser (LiveRoomScreen)
  ↓  poll every ~4.5s (draws) / 12s stale (full)
  ↓  GET /api/player/live-room?roomId=&scope=draws|full
Vercel (Next.js serverless)
  ↓  getUserFromRequest() + createServiceClient()
  ↓  Supabase reads (rooms, draws, tickets, card_numbers, users, …)
  ↓  PG-first via lib/liveRoomSnapshotPg.ts (if DATABASE_URL on Vercel)
PostgreSQL / Supabase
```

---

## New Request Flow (flag ON)

```
Browser (LiveRoomScreen)
  ↓  fetchLiveRoomSnapshot() → getLiveRoom()
  ↓  [ENGINE_PATH] live-room
  ↓  GET {GAME_ENGINE_URL}/v1/live-room?roomId=&scope=draws|full
Railway (Game Engine HTTP)
  ↓  verifyUser(JWT) + createSupabaseAdmin()
  ↓  Supabase reads + PG-first via live-room-snapshot-pg.ts (if DATABASE_URL on Railway)
PostgreSQL / Supabase
```

### Fallback (engine error / timeout / invalid payload)

```
Browser
  ↓  [FALLBACK_PATH] live-room
  ↓  GET /api/player/live-room  (unchanged Vercel route)
Vercel → PG + Supabase
```

### Legacy (flag OFF)

```
Browser
  ↓  [LEGACY_PATH] live-room
  ↓  GET /api/player/live-room
Vercel → PG + Supabase
```

---

## Endpoint Contract

### `GET /v1/live-room`

| Parameter | Required | Values |
|-----------|----------|--------|
| `roomId` | Yes | UUID |
| `scope` | No | `draws` (draws-only) or omitted/`full` (full snapshot) |

**Auth:** `Authorization: Bearer <supabase_access_token>`

### Response shape

Identical to `GET /api/player/live-room`:

**`scope=draws`:**

```json
{
  "room": {
    "id": "uuid",
    "status": "playing",
    "room_code": "…",
    "next_draw_at": "…",
    "draw_interval_sec": 3
  },
  "server_now": "ISO-8601",
  "draws": [{ "id", "number", "created_at", "processed_at" }]
}
```

**`scope=full` (default):**

```json
{
  "room": { "id", "status", "room_code", "room_seed_hash", "card_price", … },
  "tournament": { "id", "title", "round_no" } | null,
  "server_now": "ISO-8601",
  "draws": […],
  "cards": [{ "ticket_id", "player_id", "player_name", "card_number", "card", "is_my_card" }]
}
```

**Errors:**

| Status | Body |
|--------|------|
| 400 | `{ "error": "roomId is required." }` |
| 401 | `{ "error": "missing bearer token" }` / `{ "error": "invalid token" }` |
| 404 | `{ "error": "room_not_found", "message": "Room not found." }` |
| 500 | `{ "error": "…" }` |

---

## Environment Variables Required

### Next.js (Vercel)

```env
NEXT_PUBLIC_USE_GAME_ENGINE=true
NEXT_PUBLIC_GAME_ENGINE_URL=https://<railway-game-engine-host>
```

### Railway (game-engine)

```env
GAME_ENGINE_API=true
GAME_ENGINE_HTTP_PORT=8080
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgresql://...          # Required for PG-first parity
GAME_ENGINE_CORS_ORIGINS=https://dingmoney.org,http://localhost:3000
```

| Variable | Required for Phase 2 | Notes |
|----------|---------------------|-------|
| `DATABASE_URL` | **Yes** (parity) | Without it, engine falls back to Supabase-only (same as Vercel without PG) |
| `GAME_ENGINE_API` | **Yes** | Enables `/v1/*` command routes |
| `GAME_ENGINE_CORS_ORIGINS` | **Yes** (production) | Must include `https://dingmoney.org` |

---

## Fallback Behavior

| Condition | Behavior |
|-----------|----------|
| Flag off | `[LEGACY_PATH]` → Vercel only |
| Flag on, engine success | `[ENGINE_PATH]` → Railway |
| Flag on, HTTP error | `[FALLBACK_PATH]` → Vercel |
| Flag on, timeout (12s) | `[FALLBACK_PATH]` → Vercel |
| Flag on, invalid JSON / missing `room.id` or `draws` | `[FALLBACK_PATH]` → Vercel |
| Flag on, engine 404 | Throws to caller (no auto-fallback for not-found) |

Draw-sync poll in `LiveRoomScreen` catches errors and continues; full fallback poll behaves the same.

---

## Rollback Procedure

1. Set `NEXT_PUBLIC_USE_GAME_ENGINE=false` on Vercel.
2. Redeploy Next.js (or restart dev).
3. No database changes required.
4. Railway can keep running; Vercel route remains deployed.
5. Instant rollback — no code deploy needed if only env changes.

---

## PG-First Parity

Engine replicates the Vercel route logic:

| Data | PG-first function | Supabase fallback |
|------|-------------------|-------------------|
| Draws | `loadLiveDrawsFromPg` | `draws` table |
| Tickets | `loadLiveTicketsFromPg` | `tickets` table |
| Card numbers | `loadLiveCardNumbersFromPg` | `card_numbers` table (+ supabase-fallback if PG empty) |
| Room metadata | — | `rooms`, `room_templates` (always Supabase) |
| Users / tournament | — | Supabase |

Compare logging (`[liveRoomSnapshot:pg-vs-supabase]`) preserved in engine.

---

## Console Log Markers

| Marker | When |
|--------|------|
| `[ENGINE_PATH] live-room` | Successful routing to Railway |
| `[FALLBACK_PATH] live-room` | Engine failed; using Vercel |
| `[LEGACY_PATH] live-room` | Flag off; using Vercel |

---

## Estimated Vercel Invocation Reduction

Assumptions: flag ON, engine healthy, 1 active in-game user.

| Poll type | Interval | Req/hour (1 user) | Before | After |
|-----------|----------|-------------------|--------|-------|
| Draw sync | ~4.5s | ~800 | Vercel | **Railway** |
| Full fallback | 12s stale | ~300 | Vercel | **Railway** |
| Initial load | once | 1 | Vercel | **Railway** |

### Fleet estimate (flag ON, mixed player traffic)

| Metric | Phase 1 only | Phase 1 + 2 |
|--------|--------------|-------------|
| Player Vercel poll reduction | ~18–28% | **~45–55%** |
| Remaining hot Vercel polls | live-room, active-games | **active-games only** |
| Railway HTTP load increase | lobby + gameroom | **+ live-room (largest)** |

Live-room was the **single largest** Vercel poll source; Phase 2 removes it from the happy path.

---

## What Was Not Migrated

- `GET /api/player/my-active-rooms` (Phase 3 candidate)
- `GET /api/player/room-results`
- `useMenuLiveCounts` → still uses Vercel lobby-snapshot
- Wallet, tournament, admin, leaderboard
- Supabase Realtime channels (unchanged — by design)

---

## Smoke Test Checklist

1. Start engine with `GAME_ENGINE_API=true` and `DATABASE_URL` set.
2. Set `NEXT_PUBLIC_USE_GAME_ENGINE=true` on Next.js.
3. Enter a live room; DevTools console shows `[ENGINE_PATH] live-room`.
4. Network tab: requests go to Railway host, not `/api/player/live-room`.
5. Draws appear on schedule; cards render correctly.
6. Stop engine → polls show `[FALLBACK_PATH] live-room`; game continues via Vercel.
7. Set flag false → `[LEGACY_PATH] live-room` only.

---

## Related Docs

- `docs/architecture/API_MIGRATION_PHASE_1_REPORT.md`
- `docs/architecture/API_MIGRATION_VERIFICATION_REPORT.md`
- `docs/migration/api-migration-plan.md`
