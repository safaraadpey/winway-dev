# DEV Game Cron Mutex — Apply Runbook

> **Status:** READY FOR FINAL REVIEW — NOT APPLIED  
> **Authority decision:** `docs/audits/dev-runtime-authority-decision.md`  
> **SQL artifact:** `sql/migrations/_game_engine/20260731150036_dev_mutex_disable_legacy_game_crons.sql`  
> **Allowed Supabase project ref:** `yqnptpreowkimopxicfz` only

## Why this is not a top-level migration

Migrations under `sql/migrations/*.sql` (top-level) are treated as the **shared schema history** and have already been applied across environments (e.g. `game_engine_phase2_disable_heartbeat_cron` appears in DEV `schema_migrations`, yet `bingo_heartbeat` was later re-enabled).

There is **no safe in-SQL environment detector** we will use (no project-ref guessing inside Postgres).

**Choice: Option 1 — DEV-only operational SQL outside the public auto-apply chain.**

| Path | Role |
|------|------|
| `sql/migrations/_game_engine/20260731150036_dev_mutex_disable_legacy_game_crons.sql` | Manual apply to DEV only |
| `sql/migrations/<timestamp>_….sql` (top-level) | **Not used** — would risk Production if the full chain is replayed |

`sql/migrations/_game_engine/README.md` already reserves cutover cron SQL for operator-controlled apply.

**Do not** copy this file into top-level `sql/migrations/` until Production cron inventory + Railway prod ownership are separately decided and approved.

---

## Goal

On Supabase DEV only, make Railway Game Engine the **exclusive** owner of:

- waiting-room lifecycle (`bingo_heartbeat`)
- live draw clock (same heartbeat job)
- `draw_jobs` drain (`bingo_draw_worker_1..3`)

Leave maintenance crons untouched.

---

## Pre-check

Run **read-only** on the target project:

```sql
SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE jobname IN (
  'bingo_heartbeat',
  'bingo_draw_worker_1',
  'bingo_draw_worker_2',
  'bingo_draw_worker_3',
  'fn_janitor_sweep',
  'fn_generate_card_pool_step',
  'heartbeat_log_partitions',
  'cleanup_retention'
)
ORDER BY jobname;
```

**Expected before apply (DEV as of last audit):** four `bingo_*` jobs present/active; four maintenance jobs present/active.

Also confirm no live games:

```sql
SELECT id, status, engine_owner_id, engine_lease_until
FROM public.rooms
WHERE status::text IN ('waiting', 'playing', 'live')
ORDER BY updated_at DESC
LIMIT 50;
```

(Adjust status enum labels if your DEV enum differs; pass only when **zero** in-flight game rooms.)

---

## Apply conditions

All must be true before running the SQL:

1. **Supabase project ref** is exactly `yqnptpreowkimopxicfz` (Dashboard URL / linked project).  
2. **Railway DEV** still has:
   - `GAME_RUNTIME=engine`
   - `SCHEDULER_ENABLED=true`
   - `GAME_ENGINE_ROLES` includes at least:  
     `scheduler,draw-processor,room-loop,tournament-orchestrator`  
     (dev-player roles optional for mutex but currently present)
   - `ENGINE_REPLICA_COUNT=1`
3. **No** active waiting/playing rooms (pre-check above).
4. Apply **only**  
   `sql/migrations/_game_engine/20260731150036_dev_mutex_disable_legacy_game_crons.sql`  
   — do not run `scripts/game-engine-cron-draw-workers.sql` as a whole file (it contains live RESTORE schedules).
5. Operator has explicit approval for DEV mutex.

### Safety Guard (in-SQL + operator)

| Rule | Behavior |
|------|----------|
| Project ref | SQL may run **only** on `yqnptpreowkimopxicfz` |
| `matched_count > 4` | `RAISE EXCEPTION` — **no** `unschedule` has run yet; Apply must stop; inspect duplicates |
| `matched_count = 0` | Success / idempotent; still run **Post-check** |
| Target names | Only the four `bingo_*` names listed in the SQL file |

---

## Apply steps

1. Open SQL Editor (or `psql`) on **`yqnptpreowkimopxicfz` only**.  
   Any other project ref is **forbidden**.  
2. Paste/run the full contents of  
   `sql/migrations/_game_engine/20260731150036_dev_mutex_disable_legacy_game_crons.sql`.  
3. Interpret outcome:
   - **Success with `matched=0`, `unscheduled=0`:** idempotent success (targets already gone). **Post-check is still mandatory.**  
   - **Success with `matched`/`unscheduled` in 1–4:** expected first-time (or partial) apply. Confirm per-job `NOTICE` lines.  
   - **Error `dev_mutex aborted: expected at most 4 target jobs`:** **stop Apply.** Because the count check runs *before* any `unschedule`, **no target job should have been removed.** Investigate duplicate `cron.job` rows for those four names; do not re-run until duplicates are resolved and Pre-check shows ≤4 matches.  
4. Run Post-check immediately (including after the zero-match idempotent case).

---

## Post-check

```sql
SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE jobname IN (
  'bingo_heartbeat',
  'bingo_draw_worker_1',
  'bingo_draw_worker_2',
  'bingo_draw_worker_3',
  'fn_janitor_sweep',
  'fn_generate_card_pool_step',
  'heartbeat_log_partitions',
  'cleanup_retention'
)
ORDER BY jobname;
```

**Pass criteria:**

| Jobname | Required after apply |
|---------|----------------------|
| `bingo_heartbeat` | **Absent** (no row) |
| `bingo_draw_worker_1` | **Absent** |
| `bingo_draw_worker_2` | **Absent** |
| `bingo_draw_worker_3` | **Absent** |
| `fn_janitor_sweep` | Present, **active = true** |
| `fn_generate_card_pool_step` | Present, **active = true** |
| `heartbeat_log_partitions` | Present, **active = true** |
| `cleanup_retention` | Present, **active = true** |

Optional: Railway `/health` still OK; engine logs show scheduler / room-loop / draw-processor ticking.

Then execute verification scenarios from  
`docs/audits/dev-runtime-authority-decision.md` → Verification Plan (lobby → join → play → settle → tournament → restart).

---

## Rollback

> Rollback lives **here**, not inside the mutex SQL file.  
> **Stop or idle engine game workers first** (`SCHEDULER_ENABLED=false` or remove scheduler/draw-processor/room-loop roles) before restoring crons — otherwise you reintroduce double-drive.

### Heartbeat RESTORE (from `scripts/game-engine-cron-heartbeat.sql`)

That script’s RESTORE block is **commented**. Run **only** this (after engine workers that own the clock are idle):

```sql
SELECT cron.schedule(
  'bingo_heartbeat',
  '1 second',
  $$SELECT public.fn_heartbeat_tick();$$
);
```

### Draw workers RESTORE (from `scripts/game-engine-cron-draw-workers.sql`)

**Warning:** the script file contains **uncommented** `cron.schedule` RESTORE statements after DISABLE.  
**Do not** execute the entire file top-to-bottom (DISABLE then immediately RESTORE).

Run **only** these three schedules (engine draw-processor stopped/idle first):

```sql
SELECT cron.schedule(
  'bingo_draw_worker_1',
  '1 second',
  $$SELECT public.fn_process_draw_jobs_batch_worker(1, 3);$$
);
SELECT cron.schedule(
  'bingo_draw_worker_2',
  '1 second',
  $$SELECT public.fn_process_draw_jobs_batch_worker(2, 3);$$
);
SELECT cron.schedule(
  'bingo_draw_worker_3',
  '1 second',
  $$SELECT public.fn_process_draw_jobs_batch_worker(3, 3);$$
);
```

### Rollback verify

Re-run the Pre-check query; confirm four `bingo_*` jobs exist and are active; then restore Railway workers as needed.

---

## Explicit non-actions

- No Production apply.  
- No changes to `fn_janitor_sweep` or other maintenance crons.  
- No DROP of RPCs/functions.  
- No Vercel/Railway env changes as part of this SQL.  
- No git commit/push required by this runbook.
