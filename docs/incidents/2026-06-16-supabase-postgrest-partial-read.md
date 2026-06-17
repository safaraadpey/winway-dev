# Supabase/PostgREST partial read issue for room snapshots

**Date:** 2026-06-16  
**Status:** Mitigated (workaround in production); root cause unconfirmed with Supabase  
**Affected surfaces:** `GET /api/player/gameroom`, `GET /api/player/live-room`  
**Project:** Winway bingo (Next.js API + Supabase Postgres)

---

## Summary

During production testing we observed a read-path inconsistency: **Realtime subscriptions and direct PostgreSQL queries showed complete room data, while Supabase client reads through PostgREST (from Next.js API routes) returned only a partial subset**—typically the first reservation batch for a waiting room.

- **Realtime events were correct.** INSERT/UPDATE on `tickets` and `draws` reflected full activity while the page stayed connected.
- **SQL Editor showed full data.** Manual queries against `public.tickets` for the same `room_id` returned all players and card counts.
- **Direct PostgreSQL via `pg` showed full data.** Server-side queries using `DATABASE_URL` matched SQL Editor results.
- **Supabase client / PostgREST / RPC from Next.js API returned partial data.** The same API route, same `roomId`, same moment often returned only the initial purchase batch.
- **Impact:** Waiting-room `active_cards` and live-room refresh snapshots were incomplete after poll or page refresh. Realtime could mask the bug until refresh.

This was **not** a write failure. Purchases were persisted; the break was in **how the API read tickets/draws/card data through Supabase/PostgREST**.

---

## Symptoms

### Waiting room (`/api/player/gameroom`)

- `active_cards` showed only the **first purchase batch** (e.g. one player with 5 cards).
- **Additional purchases by the same player** were missing from API/poll output.
- **Other players' purchases** were missing entirely.
- **Realtime** briefly showed new purchases, then poll/API overwrote or failed to reflect the full set.
- **Different browsers** sometimes saw different `active_cards` for the same `roomId` when API reads were viewer-scoped or inconsistent (earlier debugging path).

### Live room (`/api/player/live-room`)

- After **refresh**, drawn balls and/or card grid data were **incomplete**.
- **Realtime** while connected often looked correct.
- Snapshot rebuild from API under-counted tickets and missed `card_numbers` when PostgREST returned partial rows.

---

## Key evidence

### Decisive comparison (same `roomId`, same API route, same timestamp)

For one waiting room, at the same moment:

| Source | Result |
|--------|--------|
| Supabase/PostgREST (`.from("tickets")` via service client in API) | **3** tickets/cards |
| Direct PostgreSQL (`pg` pool, same `DATABASE_URL` project) | **16** tickets/cards |

Player breakdown from direct PostgreSQL:

- **demo007:** 6 cards  
- **demo008:** 10 cards  

**Conclusion:** Physical data existed in Postgres. Realtime and SQL agreed. The API’s Supabase/PostgREST select path returned a strict subset. The defect is in the **read path**, not join/RPC writes.

### Supporting observations

- `debug_runtime_context` RPC (SECURITY DEFINER SQL inside DB) returned full `room_rows` while `.from("tickets")` in the same request returned fewer rows.
- `test_active_cards_bypass_rls` RPC returned full per-player counts when PostgREST table select did not.
- Local reproduction with **service role key** against clone DB sometimes returned full counts; production API did not—suggesting environment or PostgREST-layer behaviour, not application aggregation logic.
- `loadActiveCardsForRoom` aggregation from ticket rows **cannot drop players** if two distinct `player_user_id` values are present in the input; partial API output implied **partial ticket rows**, not a frontend merge bug.

---

## What was ruled out

| Hypothesis | Why ruled out |
|------------|----------------|
| Frontend state / React merge bug | API JSON itself was partial; SQL and `pg` were full. Merge logic cannot reduce two players to one if ticket rows contain both. |
| Realtime issue | RT INSERT events were correct; problem appeared on poll/refresh and in raw API response. |
| Join / purchase RPC write failure | SQL Editor showed all tickets after purchase; writes committed. |
| RLS owner-only as sole explanation | Waiting-room public read policy exists; service role should bypass RLS; issue persisted on service-client reads in production. |
| SECURITY DEFINER RPC ownership bug | RPCs returned **full** counts; table select via PostgREST did not. |
| Timing / race (purchase after request) | Reproduced with stable DB state; demo007/demo008 tickets existed before API call. |
| Wrong `roomId` / room resolver | Confirmed single waiting room; SQL and API used same `roomId`. |
| Wrong Supabase project / env mismatch | `starts_at`, `room_code`, and row IDs aligned with SQL Editor project for tested rooms; partial read was row-subset not empty project. |
| `starts_at` / `created_at` filter in API | No such filter in `loadActiveCardsForRoom` or live-room ticket queries in repo code. |
| Aggregation bug in `loadActiveCardsForRoom` | Logic builds from all ticket rows; cannot emit one player from two if both present in input. |

---

## Root cause status

**Exact root cause inside Supabase/PostgREST is not confirmed.**

Evidence strongly indicates a **partial-read inconsistency** on the Supabase/PostgREST/API path when Next.js used `@supabase/supabase-js` `.from(...).select(...)` for `tickets`, `draws`, and related snapshot tables—while direct SQL, SECURITY DEFINER RPCs, and the `pg` driver returned complete results against the same database.

Possible contributing factors (unverified):

- PostgREST connection pooler / read replica lag (not proven).
- Intermittent client or deployment misconfiguration (investigated; not consistently reproduced locally with service role).
- Platform-level PostgREST behaviour under specific RLS + role combinations.

**A support ticket was opened with Supabase.** Update this document when they provide an official explanation.

---

## Resolution / workaround

For **critical room snapshots** (player lists, ticket counts, draw history, card grids):

1. **Use direct PostgreSQL via `pg` as the primary read path** in Next.js API routes (`DATABASE_URL`).
2. **Keep Supabase client as fallback** when `DATABASE_URL` is unset or the `pg` query throws.
3. **Keep Realtime on Supabase**—subscriptions were reliable; do not move RT to `pg`.
4. **Non-critical metadata** (room template fields, tournament labels, user display names) may continue to use Supabase service client.

Do **not** rely on PostgREST table selects alone for correctness-sensitive snapshot assembly until root cause is closed.

---

## Implemented changes

### Gameroom — `loadActiveCardsForRoom`

**File:** `app/api/player/gameroom/route.ts`  
**Helper:** `lib/pg.ts`

- Primary: `pg` query grouping `player_user_id` / card counts for the room.
- Fallback: existing Supabase `.from("tickets")` path if `pg` fails or `DATABASE_URL` missing.
- Temporary observability (remove after stable period):
  - `[activeCardsCompare:pg-vs-supabase]`
  - `[loadActiveCardsForRoom]`
  - RPC debug: `debug_ticket_counts`, `debug_runtime_context`, `test_active_cards_bypass_rls`

### Live room snapshot

**File:** `app/api/player/live-room/route.ts`  
**Helper:** `lib/liveRoomSnapshotPg.ts`

- Primary via `pg`: processed `draws`, active `tickets`, `card_numbers` (note: `pool_card_id` is **bigint**, not uuid).
- Fallback: Supabase reads for each slice if `pg` fails.
- Supabase fallback when `pg` returns empty but Supabase has rows (card_numbers path).
- Temporary compare log (24h window in code): `[liveRoomSnapshot:pg-vs-supabase]`

### Related fix

- Live-room `card_numbers` PG query initially used `uuid[]` for `pool_card_id`; corrected to `bigint[]` after empty card grids.

---

## Production requirements

| Variable | Requirement |
|----------|-------------|
| `DATABASE_URL` | **Required** on Vercel for primary snapshot reads. |
| Connection string | Use Supabase **Transaction pooler** / Shared pooler URI from Project Settings → Database. |
| Exposure | Server-only. **Never** prefix with `NEXT_PUBLIC_`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Still required for auth, Realtime-backed routes, metadata, and fallback reads. |
| `NEXT_PUBLIC_SUPABASE_URL` | Must point to the **same** Supabase project as `DATABASE_URL`. |

Verify after deploy:

```text
[activeCardsCompare:pg-vs-supabase]  → dataSource: "pg", supabaseRows < pgTotalCards when bug present
[liveRoomSnapshot:pg-vs-supabase]    → pgTicketCount / pgDrawCount match SQL Editor
```

---

## Cleanup plan

1. **After 24h stable production** with `pg` primary reads:
   - Remove heavy debug logs (`[loadActiveCardsForRoom]` raw tickets dump, RPC debug calls, compare logs past expiry).
   - Keep minimal error logging on `pg` fallback (`pgCompareError`, `loadLiveDrawsFromPg error`, etc.).
2. **Remove temporary RPCs** when no longer needed:
   - `debug_ticket_counts`
   - `debug_runtime_context`
   - `test_active_cards_bypass_rls`
3. **Re-evaluate** whether Supabase table selects can be primary again **only after** Supabase support confirms root cause and fix.
4. **Update this document** with Supabase ticket ID, root cause, and any platform fix date.

---

## References

| Area | Path |
|------|------|
| Gameroom API | `app/api/player/gameroom/route.ts` |
| Live room API | `app/api/player/live-room/route.ts` |
| PG pool | `lib/pg.ts` |
| Live snapshot PG helpers | `lib/liveRoomSnapshotPg.ts` |
| Waiting room UI | `src/screens/GameRoomScreen.tsx` |
| Live room UI | `src/screens/LiveRoomScreen.tsx` |
| Env example | `.env.develop.local.example` (`DATABASE_URL` comment) |

---

## Lessons for future developers

1. **If Realtime and SQL agree but API poll does not**, suspect the **server read path** (PostgREST), not the UI or write RPC.
2. **Compare reads in the same request:** Supabase `.from()` vs `pg.query()` vs SQL RPC—discrepancy localizes the bug to PostgREST vs direct SQL.
3. **Do not assume service role in code guarantees identical rows to SQL Editor** without production verification on the same deploy and env.
4. **Critical snapshots** (money-adjacent counts, live game state) deserve a **direct SQL or pg primary** until the platform layer is trusted.
5. **Schema types matter in PG queries** (e.g. `pool_card_id` is `bigint`; using `uuid[]` silently breaks card grid loads).
