# P5.8 — Stage 1 Read Cutover (Admin Report Only)

> **Phase:** P5.8  
> **Date:** 2026-08-03  
> **Scope:** One admin-only sessions report; optional Platform reads  
> **Default:** `PLATFORM_REPORTS_SOURCE=legacy`

## 1. Selected report

| | |
|--|--|
| Endpoint | `GET /api/admin/platform-sessions/report` |
| Audience | `admin` / `super` only |
| Why not `/api/admin/games/report` | Games report needs Bingo winners, commission rates, room titles — **not** fully servable from `game_sessions` + `session_participants` |
| Platform tables used | `platform.game_sessions`, `platform.session_participants` |
| Legacy equivalent | `public.rooms` + `public.tickets` (same projection rules as P5.4/P5.7 shadow maps) |

Response fields: session id/status/timestamps, participant count, amounts, per-user participant rows.

**No** lobby / live / tournament / wallet / settlement write paths touched.

---

## 2. Feature flag

```bash
PLATFORM_REPORTS_SOURCE=legacy|platform|compare
```

| Mode | Behavior |
|------|----------|
| `legacy` (default) | Read rooms/tickets only; current safe behavior |
| `platform` | Read only `platform.*` via `DATABASE_URL` / `pg` |
| `compare` | Return **legacy** payload; fetch Platform; log structured diff; optional summary in JSON |

Invalid values → warn + `legacy`.

---

## 3. Compare checks

Logged under `[PlatformReports] compare`:

- row / total counts
- session ids (missing on either side)
- statuses
- participant counts
- amounts
- timestamps (`createdAt` / `startedAt` / `finishedAt` / `settledAt`)
- participant detail (status, ticketCount, amount, sourceUpdatedAt)

On mismatch: **do not fail** the HTTP request in `compare` mode — always return legacy.

On Platform read failure in `compare`: return legacy + `compare.error` in body.

On Platform read failure in `platform` mode: **503** (no silent fallback — makes misconfig visible).

---

## 4. Code map

| Path | Role |
|------|------|
| `lib/platformReports/config.ts` | Flag parser |
| `lib/platformReports/types.ts` | Shared row types + status maps |
| `lib/platformReports/legacySessionsReport.ts` | Bingo-equivalent builder |
| `lib/platformReports/platformSessionsReport.ts` | Platform PG reader |
| `lib/platformReports/compare.ts` | Diff + logging |
| `app/api/admin/platform-sessions/report/route.ts` | Admin HTTP entry |

Unchanged: `app/api/admin/games/report`, player APIs, engine, SQL.

---

## 5. Validation plan

```bash
# 1) legacy
PLATFORM_REPORTS_SOURCE=legacy
curl -s "http://localhost:3000/api/admin/platform-sessions/report?period=month" -H "Cookie: ..."

# 2) platform (requires DATABASE_URL)
PLATFORM_REPORTS_SOURCE=platform
# expect ok + reportsSource=platform

# 3) compare
PLATFORM_REPORTS_SOURCE=compare
# expect ok + reportsSource=compare + compare.summary; check logs for mismatchCount
```

Expected on current DEV shadow health: **mismatchCount ≈ 0** for overlapping mirrored sessions (same page window).

---

## 6. Compare results (DEV validation)

Script: `node tools/shadow-regression/scripts/p5-8-validate-compare.mjs`

| Check | Result |
|-------|--------|
| Sample rooms (30d, limit 50) | 50 |
| Missing Platform sessions | **0** |
| Status mismatch vs shadow map | **0** |
| Participant recon missing/dup/status/amount/ts | **0** |
| Flag default | `legacy` |
| Endpoint | `/api/admin/platform-sessions/report` |

HTTP three-mode smoke (requires admin session locally):

1. `PLATFORM_REPORTS_SOURCE=legacy` → `reportsSource: legacy`
2. `PLATFORM_REPORTS_SOURCE=platform` → `reportsSource: platform` (needs `DATABASE_URL`)
3. `PLATFORM_REPORTS_SOURCE=compare` → legacy body + `compare.summary`; logs `[PlatformReports] compare`

---

## 7. Rollback

1. Set `PLATFORM_REPORTS_SOURCE=legacy` (or unset).
2. Redeploy / restart Next if env is build-time cached (runtime `process.env` on Vercel is enough for server routes).
3. No DB rollback required — read-only cutover.

Max rollback time: **&lt; 5 minutes**.

---

## 8. Safety confirmation

| Requirement | Status |
|-------------|--------|
| Bingo writes unchanged | Yes |
| Wallet / settlement unchanged | Yes |
| Lobby / live / tournament reads unchanged | Yes |
| Legacy paths retained | Yes (`legacy` default) |
| Production Platform reads only this report when flagged | Yes |

---

## Related

- [p5-6-cutover-plan.md](./p5-6-cutover-plan.md) Stage 1
- [p5-7-participant-shadow.md](./p5-7-participant-shadow.md)
