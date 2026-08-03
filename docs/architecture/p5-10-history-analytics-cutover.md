# P5.10 — Stage 2 History & Analytics Read Cutover

> **Phase:** P5.10  
> **Date:** 2026-08-03  
> **Prerequisite:** P5.9 Stage 1 Production cutover validated  
> **Production switch:** **NOT** enabled — stop before broad switch

## 1. Goal

Move **low-risk historical / analytics reads** onto Platform session shells, without touching Bingo writes, Lobby, Live Game, Tournament lifecycle, Wallet, or Settlement.

## 2. Selected endpoints

| Endpoint | Purpose | Risk |
|----------|---------|------|
| `GET /api/admin/platform-sessions/history` | Terminal session history (settled / cancelled / finished / archived) + participants | **Low** |
| `GET /api/admin/platform-sessions/analytics` | Non-financial aggregates (counts, entry amounts by status) | **Low** |

Both are admin/super only. Default source: **legacy**.

### Also in family (Stage 1 — already live)

| Endpoint | Flag | Notes |
|----------|------|-------|
| `GET /api/admin/platform-sessions/report` | `PLATFORM_REPORTS_SOURCE` | Production already `platform`; unchanged by Stage 2 |

## 3. Excluded endpoints

| Endpoint / surface | Reason |
|--------------------|--------|
| `GET /api/admin/games/report` | Needs winners, commission %, room titles |
| `GET /api/player/room-results` | Needs `results` / draws / seeds |
| `GET /api/admin/dashboard/snapshot` | Financial deposits / withdrawals / commission |
| `GET /api/admin/tournaments/report` | Tournament lifecycle |
| `GET /api/player/tournament-finished-tables` | Tournament + winners |
| `GET /api/player/my-active-rooms` | Live active rooms |
| Lobby / live-room / gameroom snapshots | Live state / draws |
| Wallet / settlement APIs | Financial writes & truth |
| Card-pool history | Unrelated ops domain |

## 4. Feature flag (Stage 2 only)

```bash
PLATFORM_HISTORY_SOURCE=legacy|compare|platform
```

| Mode | Behavior |
|------|----------|
| `legacy` (default) | Bingo `rooms` + `tickets` |
| `compare` | Return **Legacy**; query Platform; log `[PlatformHistory]`; never fail user |
| `platform` | Read `platform.game_sessions` + `platform.session_participants` (+ `games.code`); **503** on failure — **no silent legacy fallback** |

**Independent of** `PLATFORM_REPORTS_SOURCE` so Stage 1 Production stays isolated until Stage 2 is explicitly flipped.

## 5. Source mapping

| Response field | Legacy | Platform |
|----------------|--------|----------|
| `sessionId` | `rooms.id` | `game_sessions.id` |
| `gameSlug` | `"bingo"` | `games.code` |
| `status` | mapped lifecycle | `game_sessions.status` |
| `participantCount` | active ticket users | `game_sessions.participant_count` |
| `amountTotal` / participant amounts | ticket prices (non-terminal) | `session_participants.amount_total` |
| participant status | ticket aggregation | `session_participants.status` |
| timestamps | projected from room | projected (cancelled → null lifecycle TS — P5.9) |

`session_settlement` is **not** required for these paths (empty prize lines; metadata-only would not add value yet).

Default history statuses: `settled,cancelled,finished,archived`  
Override: `?status=settled,cancelled`

## 6. Code map

| Path | Role |
|------|------|
| `lib/platformReports/config.ts` | `getPlatformHistorySource`, status maps |
| `lib/platformReports/period.ts` | Shared period / status query parsing |
| `lib/platformReports/legacySessionsReport.ts` | Legacy list + analytics |
| `lib/platformReports/platformSessionsReport.ts` | Platform list + analytics |
| `lib/platformReports/compare.ts` | History + analytics diffs / logs |
| `app/api/admin/platform-sessions/history/route.ts` | History HTTP |
| `app/api/admin/platform-sessions/analytics/route.ts` | Analytics HTTP |

## 7. Risk classification

| Risk | Detail | Mitigation |
|------|--------|------------|
| Low | Admin-only history shells | Flag default legacy; compare first |
| Low | Entry amount totals (not prizes) | Same ticket/participant projection as Stage 1 |
| Medium if mis-flagged | Accidental Production flip | Separate `PLATFORM_HISTORY_SOURCE`; docs say stop before switch |
| Out of scope | Winners / commission / live | Explicitly excluded |

## 8. Rollback

```bash
# Immediate
PLATFORM_HISTORY_SOURCE=legacy
```

No SQL rollback. Stage 1 (`PLATFORM_REPORTS_SOURCE`) unaffected.

## 9. Stop line

Do **not** set `PLATFORM_HISTORY_SOURCE=platform` (or `compare`) on Production until:

1. Local / DEV validation PASS (see testing doc)
2. Explicit operator approval for Stage 2 Production cutover

---

P5_10_HISTORY_ANALYTICS_READY_FOR_TEST
