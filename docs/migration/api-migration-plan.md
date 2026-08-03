# API Migration Plan

> Move business operations off direct browser→DB RPC calls and route them
> through the Game Engine command API, preserving frontend behavior and
> minimizing frontend changes. Backward compatible: the DB RPCs remain callable
> as a fallback.

## 1. Inventory of frontend → DB interactions

Captured from the repo (`supabase.rpc(...)` call sites). Classified by caller
context and whether they are business-logic (mutating game/financial state) or
read/report.

### 1a. Browser (client component) — **highest priority to route through engine**

| Call site | RPC | Type | Action |
| --- | --- | --- | --- |
| `services/rooms.ts:209` | `fn_join_or_create_room` | business (join/spend) | **Route → `POST /v1/rooms/join`** |
| `src/screens/TournamentRoomScreen.tsx:575/608/657` | `fn_tournament_wallet_hold` / `fn_tournament_wallet_release` | business (money) | Route → engine command (phase 2) |
| `app/admin/tournaments/create/page.tsx` | `fn_admin_create_tournament` | admin business | Route → admin command / server route |
| `app/admin/tournaments/[id]/edit/page.tsx` | `fn_admin_update_tournament`, `fn_admin_set_tournament_status`, `fn_admin_delete_tournament` | admin business | Route → admin command / server route |

### 1b. Browser — reads / reports (lower risk; cache-friendly)

| Call site | RPC |
| --- | --- |
| `services/dashboard.ts` | `fn_dashboard_admin_commission_summary[_range]`, `fn_dashboard_admin_tournament_guarantee_summary` |
| `lib/features/leaderboard/leaderboard.ts` | `get_weekly_leaders`, `get_daily_leaders[_by_date]` |
| `lib/auth-helpers.ts` | `get_user_referral_code_history` |

### 1c. Next.js API routes (already server-side) — keep, optionally proxy later

| Route | RPC |
| --- | --- |
| `app/api/player/my-active-rooms` | `fn_my_active_rooms` |
| `app/api/player/cancel-waiting-room` | `fn_cancel_waiting_room` |
| `app/api/admin/wallet/transfer` | `fn_wallet_transfer_panel` |
| `app/api/admin/wallet/adjust` | `fn_wallet_apply_delta` |
| `app/api/admin/games/report` | `fn_admin_games_report` |
| `app/api/admin/card-pool/generate` | `fn_generate_card_pool` |
| `app/api/me/ping-presence` | `fn_ping_presence` |

> These already run on the server with appropriate clients; they are not a
> browser→DB exposure. They can move behind the engine in a later phase but are
> not required for the cutover.

## 2. Engine command API (implemented)

`apps/engines/bingo/src/http/server.ts` (+ `auth.ts`, `commands.ts`). Enabled via
`GAME_ENGINE_API=true`; serves `/health` and:

| Method · Path | Auth | Underlying DB |
| --- | --- | --- |
| `POST /v1/rooms/join` | Bearer JWT | `fn_system_join_or_create_room(p_user_id, p_template_id, p_card_count, p_password)` |
| `GET /v1/rooms/:id/state` | Bearer JWT | `api_get_room_state(p_room_id)` |
| `GET /v1/lobby` | Bearer JWT | `rpc_get_active_rooms()` |

**Auth model**: the engine verifies the caller's Supabase access token
(`auth.getUser`) and substitutes the verified `user.id`. This replaces the
`auth.uid()`/RLS enforcement the DB performed for direct client calls, and lets
the engine call the engine-facing variant (`fn_system_join_or_create_room`)
which takes an explicit `p_user_id`.

## 3. Frontend change (minimal, backward compatible)

Introduce a single client helper and a feature flag; change call sites to use it.
No component/UX changes.

Recommended shim in `services/rooms.ts` (illustrative — apply when cutting over):

```ts
// NEXT_PUBLIC_USE_GAME_ENGINE + NEXT_PUBLIC_GAME_ENGINE_URL feature-flag the path.
export async function joinOrCreateRoom(args: JoinArgs) {
  if (process.env.NEXT_PUBLIC_USE_GAME_ENGINE === "true") {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`${process.env.NEXT_PUBLIC_GAME_ENGINE_URL}/v1/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ templateId: args.templateId, cardCount: args.cardCount, password: args.password }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "join failed");
    return res.json();
  }
  // Fallback: existing direct RPC (unchanged).
  const { data, error } = await supabase.rpc("fn_join_or_create_room", { /* … */ });
  if (error) throw error;
  return data;
}
```

The flag defaults off → identical current behavior. Flip per-environment to cut
over; flip back to roll back instantly.

## 4. Rollout sequence

1. **Deploy engine with `GAME_ENGINE_API=true`** alongside `legacy_db` runtime
   (workers idle). API available but unused by clients.
2. **Smoke** the API in staging (join, room-state, lobby) with a real JWT.
3. **Flip `NEXT_PUBLIC_USE_GAME_ENGINE=true`** for the join path in staging;
   verify parity against direct-RPC behavior.
4. **Security migrations** (`migration-checklist.md`): REVOKE
   `fn_system_join_or_create_room` and `fn_tournament_entry_upsert` from client
   roles; keep client `fn_join_or_create_room` until step 5.
5. **Production cutover** of the join path; monitor; then migrate tournament
   money + admin commands.
6. **Reads** (dashboard/leaderboard) optionally fronted by the engine with a
   short Redis cache (no behavior change).

## 5. Backward-compatibility & fallback guarantees

- Every routed RPC remains in the DB and callable; the feature flag toggles the
  path with no schema change.
- The engine calls the **same** DB functions (or engine-facing variants writing
  the same rows), so payloads and side effects match.
- Runtime fallback: `GAME_RUNTIME=legacy_db` + re-enabled cron restores the pure
  DB engine even with the API deployed.
