-- P1: Incremental platform.fn_shadow_reconcile (changed-rows-only, triple watermark).
-- P0 preserved: does NOT re-enable platform_shadow_reconcile cron.
-- fn_shadow_reconcile_full retains P5.7 full-scan body for manual ops only.

-- ---------------------------------------------------------------------------
-- Reconcile cursor state (singleton)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.shadow_reconcile_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rooms_watermark timestamptz NOT NULL,
  tickets_watermark timestamptz NOT NULL,
  participants_watermark timestamptz NOT NULL,
  last_run_at timestamptz,
  last_enqueued int NOT NULL DEFAULT 0,
  last_candidates int NOT NULL DEFAULT 0,
  last_duration_ms numeric(12, 3),
  runs_total bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform.shadow_reconcile_state (
  id,
  rooms_watermark,
  tickets_watermark,
  participants_watermark
)
VALUES (
  1,
  now() - interval '2 minutes',
  now() - interval '2 minutes',
  now() - interval '2 minutes'
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Watermark indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tickets_updated_at
  ON public.tickets (updated_at);

CREATE INDEX IF NOT EXISTS idx_rooms_updated_at
  ON public.rooms (updated_at);

CREATE INDEX IF NOT EXISTS idx_session_participants_updated_at
  ON platform.session_participants (updated_at);

CREATE INDEX IF NOT EXISTS idx_game_sessions_updated_at
  ON platform.game_sessions (updated_at);

-- ---------------------------------------------------------------------------
-- Shadow-only participant touch trigger (platform schema only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.trg_session_participants_reconcile_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_session_participants_reconcile_touch ON platform.session_participants;
CREATE TRIGGER trg_session_participants_reconcile_touch
  BEFORE UPDATE ON platform.session_participants
  FOR EACH ROW
  EXECUTE FUNCTION platform.trg_session_participants_reconcile_touch();

-- ---------------------------------------------------------------------------
-- Manual safety net: full-table scan (P5.7 body, never cron)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_reconcile_full(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $full$
DECLARE
  r record;
  v_n int := 0;
  v_started timestamptz := clock_timestamp();
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 200;
  END IF;

  SET LOCAL statement_timeout = '30s';

  FOR r IN
    SELECT z.id
    FROM (
      SELECT u.id, max(u.updated_at) AS updated_at
      FROM (
        SELECT rm.id, rm.updated_at
        FROM public.rooms rm
        LEFT JOIN platform.game_sessions gs ON gs.id = rm.id
        WHERE gs.id IS NULL
           OR gs.status IS DISTINCT FROM platform.fn_shadow_map_lifecycle(rm.status::text, rm.engine_owner_id)
           OR gs.lease_owner IS DISTINCT FROM rm.engine_owner_id
           OR gs.lease_expires_at IS DISTINCT FROM rm.engine_lease_until

        UNION ALL

        SELECT t.room_id AS id, max(t.updated_at) AS updated_at
        FROM public.tickets t
        WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')
          AND NOT EXISTS (
            SELECT 1 FROM platform.session_participants sp
            WHERE sp.session_id = t.room_id
              AND sp.user_id = t.player_user_id
              AND sp.status IN ('joined', 'active')
          )
        GROUP BY t.room_id

        UNION ALL

        SELECT t.room_id AS id, max(t.updated_at) AS updated_at
        FROM public.tickets t
        JOIN platform.session_participants sp
          ON sp.session_id = t.room_id AND sp.user_id = t.player_user_id
        WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')
        GROUP BY t.room_id, t.player_user_id, sp.amount_total
        HAVING sp.amount_total IS DISTINCT FROM coalesce(sum(t.price), 0)
      ) u
      GROUP BY u.id
    ) z
    ORDER BY z.updated_at DESC NULLS LAST
    LIMIT p_limit
  LOOP
    PERFORM platform.fn_shadow_enqueue(r.id);
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'enqueued', v_n,
    'mode', 'full',
    'duration_ms', round(extract(epoch FROM (clock_timestamp() - v_started)) * 1000, 3)
  );
END;
$full$;

REVOKE ALL ON FUNCTION platform.fn_shadow_reconcile_full(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_reconcile_full(integer) TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_reconcile_full(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Incremental reconcile (triple watermark, candidate-room scoped parity)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_reconcile(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $inc$
DECLARE
  v_lock_key bigint := hashtext('platform.shadow_reconcile');
  v_overlap interval := interval '60 seconds';
  v_rooms_wm timestamptz;
  v_tickets_wm timestamptz;
  v_participants_wm timestamptz;
  v_rooms_since timestamptz;
  v_tickets_since timestamptz;
  v_participants_since timestamptz;
  v_max_rooms_ts timestamptz;
  v_max_tickets_ts timestamptz;
  v_max_participants_ts timestamptz;
  v_n int := 0;
  v_candidates int := 0;
  v_rooms_window int := 0;
  v_tickets_window int := 0;
  v_participants_window int := 0;
  v_started timestamptz := clock_timestamp();
  r record;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 200;
  END IF;

  IF NOT pg_try_advisory_lock(v_lock_key) THEN
    RETURN jsonb_build_object(
      'enqueued', 0,
      'mode', 'incremental',
      'skipped_overlap', true
    );
  END IF;

  BEGIN
    SET LOCAL statement_timeout = '5s';

    SELECT s.rooms_watermark, s.tickets_watermark, s.participants_watermark
    INTO v_rooms_wm, v_tickets_wm, v_participants_wm
    FROM platform.shadow_reconcile_state s
    WHERE s.id = 1;

    IF v_rooms_wm IS NULL THEN
      RAISE EXCEPTION 'platform.shadow_reconcile_state row missing';
    END IF;

    v_rooms_since := v_rooms_wm - v_overlap;
    v_tickets_since := v_tickets_wm - v_overlap;
    v_participants_since := v_participants_wm - v_overlap;

    SELECT count(*)::int INTO v_rooms_window
    FROM public.rooms rm
    WHERE rm.updated_at >= v_rooms_since;

    SELECT count(DISTINCT t.room_id)::int INTO v_tickets_window
    FROM public.tickets t
    WHERE t.updated_at >= v_tickets_since;

    SELECT count(DISTINCT sp.session_id)::int INTO v_participants_window
    FROM platform.session_participants sp
    WHERE GREATEST(sp.updated_at, COALESCE(sp.source_updated_at, sp.updated_at)) >= v_participants_since;

    SELECT coalesce(max(rm.updated_at), v_rooms_wm) INTO v_max_rooms_ts
    FROM public.rooms rm
    WHERE rm.updated_at >= v_rooms_since;

    SELECT coalesce(max(gs.updated_at), v_max_rooms_ts) INTO v_max_rooms_ts
    FROM platform.game_sessions gs
    WHERE gs.updated_at >= v_rooms_since;

    SELECT coalesce(max(t.updated_at), v_tickets_wm) INTO v_max_tickets_ts
    FROM public.tickets t
    WHERE t.updated_at >= v_tickets_since;

    SELECT coalesce(
      max(GREATEST(sp.updated_at, COALESCE(sp.source_updated_at, sp.updated_at))),
      v_participants_wm
    ) INTO v_max_participants_ts
    FROM platform.session_participants sp
    WHERE GREATEST(sp.updated_at, COALESCE(sp.source_updated_at, sp.updated_at)) >= v_participants_since;

    FOR r IN
      WITH
      room_c AS (
        SELECT rm.id AS room_id, rm.updated_at AS change_ts
        FROM public.rooms rm
        WHERE rm.updated_at >= v_rooms_since
      ),
      session_c AS (
        SELECT gs.id AS room_id, gs.updated_at AS change_ts
        FROM platform.game_sessions gs
        WHERE gs.updated_at >= v_rooms_since
      ),
      ticket_c AS (
        SELECT t.room_id, max(t.updated_at) AS change_ts
        FROM public.tickets t
        WHERE t.updated_at >= v_tickets_since
        GROUP BY t.room_id
      ),
      part_c AS (
        SELECT sp.session_id AS room_id,
               max(GREATEST(sp.updated_at, COALESCE(sp.source_updated_at, sp.updated_at))) AS change_ts
        FROM platform.session_participants sp
        WHERE GREATEST(sp.updated_at, COALESCE(sp.source_updated_at, sp.updated_at)) >= v_participants_since
        GROUP BY sp.session_id
      ),
      candidates AS (
        SELECT room_id, max(change_ts) AS change_ts
        FROM (
          SELECT room_id, change_ts FROM room_c
          UNION ALL
          SELECT room_id, change_ts FROM session_c
          UNION ALL
          SELECT room_id, change_ts FROM ticket_c
          UNION ALL
          SELECT room_id, change_ts FROM part_c
        ) u
        GROUP BY room_id
      )
      SELECT c.room_id
      FROM candidates c
      ORDER BY c.change_ts DESC NULLS LAST
      LIMIT p_limit
    LOOP
      v_candidates := v_candidates + 1;

      IF EXISTS (
        SELECT 1
        FROM public.rooms rm
        LEFT JOIN platform.game_sessions gs ON gs.id = rm.id
        WHERE rm.id = r.room_id
          AND (
            gs.id IS NULL
            OR gs.status IS DISTINCT FROM platform.fn_shadow_map_lifecycle(rm.status::text, rm.engine_owner_id)
            OR gs.lease_owner IS DISTINCT FROM rm.engine_owner_id
            OR gs.lease_expires_at IS DISTINCT FROM rm.engine_lease_until
          )
      ) OR EXISTS (
        SELECT 1
        FROM public.tickets t
        WHERE t.room_id = r.room_id
          AND t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')
          AND NOT EXISTS (
            SELECT 1
            FROM platform.session_participants sp
            WHERE sp.session_id = t.room_id
              AND sp.user_id = t.player_user_id
              AND sp.status IN ('joined', 'active')
          )
      ) OR EXISTS (
        SELECT 1
        FROM (
          SELECT
            t.room_id,
            t.player_user_id,
            coalesce(sum(t.price), 0)::numeric(18, 2) AS expected_amount
          FROM public.tickets t
          WHERE t.room_id = r.room_id
            AND t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')
          GROUP BY t.room_id, t.player_user_id
        ) e
        JOIN platform.session_participants sp
          ON sp.session_id = e.room_id AND sp.user_id = e.player_user_id
        WHERE sp.amount_total IS DISTINCT FROM e.expected_amount
      ) OR EXISTS (
        SELECT 1
        FROM (
          SELECT
            t.room_id,
            t.player_user_id,
            platform.fn_shadow_map_participant_status(
              count(*) FILTER (
                WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')
              )::integer,
              bool_or(t.reservation_status::text = 'held'),
              bool_or(t.reservation_status::text IN ('reserved', 'confirmed', 'consumed'))
            ) AS expected_status
          FROM public.tickets t
          WHERE t.room_id = r.room_id
          GROUP BY t.room_id, t.player_user_id
        ) e
        JOIN platform.session_participants sp
          ON sp.session_id = e.room_id AND sp.user_id = e.player_user_id
        WHERE sp.status IS DISTINCT FROM e.expected_status
      ) OR EXISTS (
        SELECT 1
        FROM (
          SELECT t.room_id, t.player_user_id, max(t.updated_at) AS src_updated
          FROM public.tickets t
          WHERE t.room_id = r.room_id
          GROUP BY t.room_id, t.player_user_id
        ) e
        JOIN platform.session_participants sp
          ON sp.session_id = e.room_id AND sp.user_id = e.player_user_id
        WHERE sp.source_updated_at IS NOT NULL
          AND sp.source_updated_at IS DISTINCT FROM e.src_updated
      ) THEN
        PERFORM platform.fn_shadow_enqueue(r.room_id);
        v_n := v_n + 1;
      END IF;
    END LOOP;

    UPDATE platform.shadow_reconcile_state
    SET
      rooms_watermark = v_max_rooms_ts,
      tickets_watermark = v_max_tickets_ts,
      participants_watermark = v_max_participants_ts,
      last_run_at = now(),
      last_enqueued = v_n,
      last_candidates = v_candidates,
      last_duration_ms = round(extract(epoch FROM (clock_timestamp() - v_started)) * 1000, 3),
      runs_total = runs_total + 1,
      updated_at = now()
    WHERE id = 1;

    PERFORM pg_advisory_unlock(v_lock_key);

    RETURN jsonb_build_object(
      'enqueued', v_n,
      'mode', 'incremental',
      'candidates', v_candidates,
      'rooms_window', v_rooms_window,
      'tickets_window', v_tickets_window,
      'participants_window', v_participants_window,
      'skipped_overlap', false,
      'duration_ms', round(extract(epoch FROM (clock_timestamp() - v_started)) * 1000, 3),
      'rooms_watermark', v_max_rooms_ts,
      'tickets_watermark', v_max_tickets_ts,
      'participants_watermark', v_max_participants_ts
    );
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_advisory_unlock(v_lock_key);
      RAISE;
  END;
END;
$inc$;

REVOKE ALL ON FUNCTION platform.fn_shadow_reconcile(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_reconcile(integer) TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_reconcile(integer) TO service_role;

-- P0 preserved: platform_shadow_reconcile cron remains disabled.
-- ROLLBACK (manual):
-- DROP FUNCTION IF EXISTS platform.fn_shadow_reconcile_full(integer);
-- DROP TRIGGER IF EXISTS trg_session_participants_reconcile_touch ON platform.session_participants;
-- DROP FUNCTION IF EXISTS platform.trg_session_participants_reconcile_touch();
-- DROP TABLE IF EXISTS platform.shadow_reconcile_state;
-- Restore P5.7 fn_shadow_reconcile from _legacy_archive/20260803114510_p5_7_platform_participant_shadow.sql
