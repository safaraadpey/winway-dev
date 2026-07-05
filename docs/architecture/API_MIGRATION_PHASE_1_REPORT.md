# API Migration Phase 1 Report

> Date: 2026-07-05  
> Scope: Hot player room read paths + join — lobby polling, gameroom polling, join room  
> Feature flag: `NEXT_PUBLIC_USE_GAME_ENGINE` + `NEXT_PUBLIC_GAME_ENGINE_URL`

---

## Summary

Phase 1 routes three player flows through the **Railway Game Engine** when the feature flag is enabled. All existing Vercel `/api/*` routes and direct Supabase RPC paths remain unchanged and are used when the flag is off (or when the engine path fails for gameroom reads).

Console markers:

| Marker | Meaning |
|--------|---------|
| `[ENGINE_PATH] …` | Request went to Game Engine |
| `[LEGACY_PATH] …` | Request used existing Vercel/Supabase path |

---

## Files Changed

### Frontend (Next.js)

| File | Change |
|------|--------|
| `lib/gameEngine/config.ts` | **New** — `isGameEngineEnabled()`, `getGameEngineBaseUrl()` |
| `lib/gameEngineClient.ts` | **New** — `getLobby()`, `getRoomState()`, `joinOrCreateRoomViaEngine()`, auth fetch helper |
| `services/rooms.ts` | `joinOrCreateRoom()` and `fetchGameRoomView()` branch on feature flag |
| `app/player/lobby/page.tsx` | Lobby polling uses `getLobby()` when flag enabled |
| `README.md` | Documented new env vars |

### Game Engine (Railway)

| File | Change |
|------|--------|
| `game-engine/src/http/lobby-snapshot.ts` | **New** — lobby snapshot builder (matches `/api/player/lobby-snapshot`) |
| `game-engine/src/http/gameroom-view.ts` | **New** — `GameRoomView` builder (matches `/api/player/gameroom`, Supabase-only) |
| `game-engine/src/http/cors.ts` | **New** — CORS for browser → engine calls |
| `game-engine/src/http/commands.ts` | `getLobby()` returns snapshot; added `getGameRoomView()` |
| `game-engine/src/http/server.ts` | Added `GET /v1/gameroom`, CORS preflight |

### Not changed (by design)

- All existing `/app/api/**` routes
- Live room polling (`/api/player/live-room`)
- Active games, tournament, wallet, admin, dev-panel
- Database schema / migrations

---

## Routes Migrated

| Player flow | Flag ON | Flag OFF |
|-------------|---------|----------|
| **Lobby polling** | `GET {GAME_ENGINE_URL}/v1/lobby` | `GET /api/player/lobby-snapshot` |
| **Gameroom polling** | `GET {GAME_ENGINE_URL}/v1/gameroom?roomId=` or `?templateId=` | `GET /api/player/gameroom` |
| **Join room** | `POST {GAME_ENGINE_URL}/v1/rooms/join` | `supabase.rpc('fn_join_or_create_room')` |

### Engine endpoints used

| Method | Path | Auth |
|--------|------|------|
| GET | `/v1/lobby` | Bearer JWT |
| GET | `/v1/gameroom?roomId=&templateId=` | Bearer JWT |
| POST | `/v1/rooms/join` | Bearer JWT |

Existing `GET /v1/rooms/:id/state` (raw `api_get_room_state`) is unchanged; gameroom polling uses `/v1/gameroom` for `GameRoomView` parity.

---

## Fallback Behavior

| Flow | Fallback |
|------|----------|
| Lobby | Flag off → Vercel. Flag on → engine only (errors hit existing lobby catch/backoff). |
| Gameroom | Flag off → Vercel. Flag on → engine first; **on engine error, falls back to Vercel** `/api/player/gameroom`. |
| Join | Flag off → Supabase RPC. Flag on → engine only (errors mapped to same Persian messages; no auto-retry via RPC). |

Default: `NEXT_PUBLIC_USE_GAME_ENGINE` unset or not `"true"` → **100% legacy behavior**.

---

## Environment Variables

### Next.js (`.env.local`)

```env
NEXT_PUBLIC_USE_GAME_ENGINE=false
NEXT_PUBLIC_GAME_ENGINE_URL=http://localhost:8080
```

Both are required for engine path. URL is trimmed; trailing slashes stripped.

### Game Engine (Railway / local)

```env
GAME_ENGINE_API=true
GAME_ENGINE_HTTP_PORT=8080
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
# Optional — restrict browser origins (comma-separated). Default: *
GAME_ENGINE_CORS_ORIGINS=http://localhost:3000,https://dingmoney.org
```

---

## Risks

| Risk | Severity | Notes |
|------|----------|-------|
| **CORS misconfiguration** | High | Browser calls engine directly; set `GAME_ENGINE_CORS_ORIGINS` in production. |
| **Gameroom PG vs Supabase lifecycle** | Medium | Engine `/v1/gameroom` uses Supabase room fields only; Vercel route may still use direct PG for lifecycle when `DATABASE_URL` is set. Countdown/status could differ briefly — monitor after cutover. |
| **Join uses `fn_system_join_or_create_room`** | Medium | Engine path calls system RPC with verified user id; must be granted to service role. |
| **Engine unavailable with flag on** | High | Lobby/join fail visibly; gameroom auto-falls back to Vercel. |
| **No change to live-room polling** | Low | Highest-frequency in-game polls still hit Vercel (Phase 2+). |

---

## How to Test Locally

### 1. Start Game Engine with API enabled

```bash
cd game-engine
GAME_ENGINE_API=true \
GAME_ENGINE_HTTP_PORT=8080 \
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run dev
```

Verify: `curl http://localhost:8080/health`

### 2. Configure Next.js

```env
NEXT_PUBLIC_USE_GAME_ENGINE=true
NEXT_PUBLIC_GAME_ENGINE_URL=http://localhost:8080
```

In game-engine `.env` or shell:

```env
GAME_ENGINE_CORS_ORIGINS=http://localhost:3000
```

### 3. Run Next.js

```bash
npm run dev
```

### 4. Smoke tests

1. **Lobby** — Open `/player/lobby`. DevTools console should show `[ENGINE_PATH] getLobby`. Room groups should match legacy.
2. **Gameroom** — Enter a waiting room. Console: `[ENGINE_PATH] getRoomState` or `getGameRoomViewByTemplate`. Countdown, active cards, tables unchanged.
3. **Join** — Buy cards from preview/waiting room. Console: `[ENGINE_PATH] joinOrCreateRoom`. Room created; wallet debited once.
4. **Flag off** — Set `NEXT_PUBLIC_USE_GAME_ENGINE=false`, restart Next. Console should show `[LEGACY_PATH]` for all three flows.

### 5. Auth

All engine calls require a logged-in session (Bearer token from Supabase). Unauthenticated lobby shows existing no-token polling behavior.

---

## How to Roll Back

1. Set `NEXT_PUBLIC_USE_GAME_ENGINE=false` (or remove the variable) in Vercel/host env.
2. Redeploy Next.js (or restart local dev).
3. No database rollback required — RPCs and API routes unchanged.
4. Game Engine can stay running (`GAME_ENGINE_API=true`) unused.

Instant rollback: flip flag per environment without code deploy.

---

## Related Docs

- `docs/migration/api-migration-plan.md` — full migration plan
- `docs/architecture/API_REQUEST_GRAPH_REPORT.md` — request graph and risk ranking
