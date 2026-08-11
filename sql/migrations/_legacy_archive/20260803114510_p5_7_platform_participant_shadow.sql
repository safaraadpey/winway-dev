-- P5.7 - Platform Participant Shadow
-- Scope: Mirror Bingo tickets → platform.session_participants (WRITE ONLY).
-- Non-goals: no Bingo/wallet/settle/tournament/app-read changes; Platform not SoT.
-- Identity: session_id = room_id; user_id = player_user_id; UNIQUE(session_id, user_id).
-- Failure: tickets trigger enqueue never fails Bingo; retries via existing shadow_outbox.
-- Builds on: P5.4 platform shadow (fn_shadow_enqueue / drain / mirror_room).

BEGIN;

-- ---------------------------------------------------------------------------
-- Additive columns on session_participants (shadow metadata)
-- ---------------------------------------------------------------------------
ALTER TABLE platform.session_participants
  ADD COLUMN IF NOT EXISTS ticket_count integer NOT NULL DEFAULT 0
    CHECK (ticket_count >= 0);

ALTER TABLE platform.session_participants
  ADD COLUMN IF NOT EXISTS ticket_count_all integer NOT NULL DEFAULT 0
    CHECK (ticket_count_all >= 0);

ALTER TABLE platform.session_participants
  ADD COLUMN IF NOT EXISTS amount_total numeric(18, 2) NOT NULL DEFAULT 0
    CHECK (amount_total >= 0);

ALTER TABLE platform.session_participants
  ADD COLUMN IF NOT EXISTS amount_gross numeric(18, 2) NOT NULL DEFAULT 0
    CHECK (amount_gross >= 0);

ALTER TABLE platform.session_participants
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;

ALTER TABLE platform.session_participants
  ADD COLUMN IF NOT EXISTS mirror_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN platform.session_participants.ticket_count IS
  'P5.7 shadow: count of non-terminal Bingo tickets for this user in room';
COMMENT ON COLUMN platform.session_participants.amount_total IS
  'P5.7 shadow: sum(price) of non-terminal tickets (amount parity)';
COMMENT ON COLUMN platform.session_participants.amount_gross IS
  'P5.7 shadow: sum(price) of all tickets including cancelled';
COMMENT ON COLUMN platform.session_participants.mirror_meta IS
  'P5.7 shadow: opaque Bingo ticket aggregate metadata (not financial SoT)';

-- ---------------------------------------------------------------------------
-- Map Bingo ticket aggregate → Platform participant status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_map_participant_status(
  p_active_tickets integer,
  p_has_held boolean,
  p_has_live boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN COALESCE(p_active_tickets, 0) <= 0 THEN 'left'
    WHEN COALESCE(p_has_live, false) THEN 'active'
    WHEN COALESCE(p_has_held, false) THEN 'joined'
    ELSE 'joined'
  END;
$fn$;

REVOKE ALL ON FUNCTION platform.fn_shadow_map_participant_status(integer, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_map_participant_status(integer, boolean, boolean) TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_map_participant_status(integer, boolean, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Idempotent participant mirror for one room
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_mirror_participants(
  p_room_id uuid,
  p_retry_count integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $fn$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_duration_ms numeric(12, 3);
  v_result text := 'ok';
  v_detail text := NULL;
  v_upserted int := 0;
  v_left int := 0;
  v_active_count int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = p_room_id) THEN
    v_result := 'skipped';
    v_detail := 'room_not_found';
    v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;
    INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
    VALUES (p_room_id, p_room_id, 'participants', v_result, p_retry_count, v_duration_ms, v_detail);
    RAISE LOG '[PlatformShadow] participants room_id=% result=% retry=% detail=%',
      p_room_id, v_result, p_retry_count, v_detail;
    RETURN jsonb_build_object(
      'room_id', p_room_id,
      'result', v_result,
      'detail', v_detail,
      'retry_count', p_retry_count,
      'duration_ms', v_duration_ms
    );
  END IF;

  -- Ensure session shell exists (identity session_id = room_id)
  IF NOT EXISTS (SELECT 1 FROM platform.game_sessions gs WHERE gs.id = p_room_id) THEN
    PERFORM platform.fn_shadow_mirror_room(p_room_id, p_retry_count);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM platform.game_sessions gs WHERE gs.id = p_room_id) THEN
    v_result := 'error';
    v_detail := 'session_missing_after_mirror_room';
    v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;
    INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
    VALUES (p_room_id, p_room_id, 'participants', v_result, p_retry_count, v_duration_ms, v_detail);
    RETURN jsonb_build_object(
      'room_id', p_room_id,
      'result', v_result,
      'detail', v_detail,
      'retry_count', p_retry_count,
      'duration_ms', v_duration_ms
    );
  END IF;

  WITH ticket_agg AS (
    SELECT
      t.player_user_id AS user_id,
      count(*) FILTER (
        WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')
      )::integer AS active_tickets,
      count(*)::integer AS ticket_count_all,
      coalesce(sum(t.price) FILTER (
        WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')
      ), 0)::numeric(18, 2) AS amount_total,
      coalesce(sum(t.price), 0)::numeric(18, 2) AS amount_gross,
      bool_or(t.reservation_status::text = 'held') AS has_held,
      bool_or(t.reservation_status::text IN ('reserved', 'confirmed', 'consumed')) AS has_live,
      min(t.created_at) AS joined_at,
      max(t.cancelled_at) AS max_cancelled_at,
      max(t.updated_at) AS source_updated_at,
      (array_agg(t.transaction_id ORDER BY t.created_at)
        FILTER (WHERE t.transaction_id IS NOT NULL))[1] AS hold_tx
    FROM public.tickets t
    WHERE t.room_id = p_room_id
    GROUP BY t.player_user_id
  ),
  normalized AS (
    SELECT
      a.user_id,
      platform.fn_shadow_map_participant_status(a.active_tickets, a.has_held, a.has_live) AS status,
      a.active_tickets AS ticket_count,
      a.ticket_count_all,
      a.amount_total,
      a.amount_gross,
      a.joined_at,
      CASE
        WHEN platform.fn_shadow_map_participant_status(a.active_tickets, a.has_held, a.has_live) = 'left'
          THEN COALESCE(a.max_cancelled_at, a.source_updated_at, now())
        ELSE NULL
      END AS left_at,
      COALESCE(a.hold_tx::text, 'bingo.tickets:' || a.ticket_count_all::text) AS hold_ref,
      a.source_updated_at,
      jsonb_build_object(
        'active_tickets', a.active_tickets,
        'ticket_count_all', a.ticket_count_all,
        'has_held', a.has_held,
        'has_live', a.has_live
      ) AS mirror_meta
    FROM ticket_agg a
  ),
  upserted AS (
    INSERT INTO platform.session_participants AS sp (
      session_id,
      user_id,
      status,
      seat_no,
      hold_ref,
      joined_at,
      left_at,
      ticket_count,
      ticket_count_all,
      amount_total,
      amount_gross,
      source_updated_at,
      mirror_meta,
      updated_at
    )
    SELECT
      p_room_id,
      n.user_id,
      n.status,
      NULL,
      n.hold_ref,
      n.joined_at,
      n.left_at,
      n.ticket_count,
      n.ticket_count_all,
      n.amount_total,
      n.amount_gross,
      n.source_updated_at,
      n.mirror_meta,
      now()
    FROM normalized n
    ON CONFLICT (session_id, user_id) DO UPDATE SET
      status = EXCLUDED.status,
      hold_ref = EXCLUDED.hold_ref,
      joined_at = LEAST(sp.joined_at, EXCLUDED.joined_at),
      left_at = EXCLUDED.left_at,
      ticket_count = EXCLUDED.ticket_count,
      ticket_count_all = EXCLUDED.ticket_count_all,
      amount_total = EXCLUDED.amount_total,
      amount_gross = EXCLUDED.amount_gross,
      source_updated_at = EXCLUDED.source_updated_at,
      mirror_meta = EXCLUDED.mirror_meta,
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*)::int INTO v_upserted FROM upserted;

  -- Users no longer present on any ticket → left
  UPDATE platform.session_participants sp
  SET
    status = 'left',
    ticket_count = 0,
    amount_total = 0,
    left_at = COALESCE(sp.left_at, now()),
    updated_at = now(),
    mirror_meta = COALESCE(sp.mirror_meta, '{}'::jsonb) || jsonb_build_object('removed_from_tickets', true)
  WHERE sp.session_id = p_room_id
    AND NOT EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.room_id = p_room_id AND t.player_user_id = sp.user_id
    )
    AND sp.status IS DISTINCT FROM 'left';

  GET DIAGNOSTICS v_left = ROW_COUNT;

  SELECT count(*)::int INTO v_active_count
  FROM platform.session_participants sp
  WHERE sp.session_id = p_room_id
    AND sp.status IN ('joined', 'active');

  UPDATE platform.game_sessions gs
  SET
    participant_count = v_active_count,
    updated_at = now()
  WHERE gs.id = p_room_id
    AND gs.participant_count IS DISTINCT FROM v_active_count;

  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;

  INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
  VALUES (
    p_room_id,
    p_room_id,
    'participants',
    v_result,
    p_retry_count,
    v_duration_ms,
    format('upserted=%s left_marked=%s active=%s', v_upserted, v_left, v_active_count)
  );

  RAISE LOG '[PlatformShadow] participants room_id=% session_id=% result=% retry=% duration_ms=% upserted=% active=%',
    p_room_id, p_room_id, v_result, p_retry_count, v_duration_ms, v_upserted, v_active_count;

  RETURN jsonb_build_object(
    'room_id', p_room_id,
    'session_id', p_room_id,
    'result', v_result,
    'upserted', v_upserted,
    'left_marked', v_left,
    'active', v_active_count,
    'retry_count', p_retry_count,
    'duration_ms', v_duration_ms
  );
EXCEPTION
  WHEN OTHERS THEN
    v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;
    v_result := 'error';
    v_detail := SQLERRM;
    BEGIN
      INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
      VALUES (p_room_id, p_room_id, 'participants', v_result, p_retry_count, v_duration_ms, v_detail);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RAISE LOG '[PlatformShadow] participants room_id=% result=% retry=% detail=%',
      p_room_id, v_result, p_retry_count, v_detail;
    RETURN jsonb_build_object(
      'room_id', p_room_id,
      'session_id', p_room_id,
      'result', v_result,
      'detail', v_detail,
      'retry_count', p_retry_count,
      'duration_ms', v_duration_ms
    );
END;
$fn$;

REVOKE ALL ON FUNCTION platform.fn_shadow_mirror_participants(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_mirror_participants(uuid, integer) TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_mirror_participants(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Tickets trigger → enqueue room (never fail Bingo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.trg_tickets_platform_shadow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $fn$
DECLARE
  v_room uuid;
BEGIN
  BEGIN
    v_room := COALESCE(NEW.room_id, OLD.room_id);
    IF v_room IS NOT NULL THEN
      PERFORM platform.fn_shadow_enqueue(v_room);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[PlatformShadow] tickets_enqueue_failed room_id=% sqlstate=% err=%',
        v_room, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION platform.trg_tickets_platform_shadow() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.trg_tickets_platform_shadow() TO postgres;

DROP TRIGGER IF EXISTS trg_tickets_platform_shadow ON public.tickets;
CREATE TRIGGER trg_tickets_platform_shadow
  AFTER INSERT OR UPDATE OF reservation_status, cancelled_at, price, player_user_id, room_id, transaction_id
  OR DELETE
  ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION platform.trg_tickets_platform_shadow();

COMMENT ON TRIGGER trg_tickets_platform_shadow ON public.tickets IS
  'P5.7 participant shadow enqueue only; must not affect Bingo/wallet/settle.';

-- ---------------------------------------------------------------------------
-- Patch drain: after room mirror ok/skipped, mirror participants
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_drain(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $fn$
DECLARE
  r record;
  v_res jsonb;
  v_pres jsonb;
  v_ok int := 0;
  v_err int := 0;
  v_skip int := 0;
  v_dlq int := 0;
  v_backoff interval;
  v_part_ok boolean;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 50;
  END IF;

  FOR r IN
    SELECT o.id, o.room_id, o.retry_count, o.max_retries
    FROM platform.shadow_outbox o
    WHERE o.processed_at IS NULL
      AND o.dead_lettered_at IS NULL
      AND o.next_attempt_at <= now()
    ORDER BY o.next_attempt_at, o.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    v_res := platform.fn_shadow_mirror_room(r.room_id, r.retry_count);
    v_part_ok := true;

    IF (v_res->>'result') IN ('ok', 'skipped') THEN
      -- Always attempt participants when room mirror did not hard-error
      IF (v_res->>'result') = 'ok' OR EXISTS (SELECT 1 FROM platform.game_sessions gs WHERE gs.id = r.room_id) THEN
        v_pres := platform.fn_shadow_mirror_participants(r.room_id, r.retry_count);
        IF (v_pres->>'result') = 'error' THEN
          v_part_ok := false;
          v_res := v_pres;
        END IF;
      END IF;
    END IF;

    IF (v_res->>'result') = 'ok' AND v_part_ok THEN
      UPDATE platform.shadow_outbox
      SET processed_at = now(), last_error = NULL
      WHERE id = r.id;
      v_ok := v_ok + 1;
    ELSIF (v_res->>'result') = 'skipped' AND v_part_ok THEN
      UPDATE platform.shadow_outbox
      SET processed_at = now(), last_error = v_res->>'detail'
      WHERE id = r.id;
      v_skip := v_skip + 1;
    ELSE
      IF r.retry_count + 1 >= r.max_retries THEN
        UPDATE platform.shadow_outbox
        SET retry_count = r.retry_count + 1,
            last_error = COALESCE(v_res->>'detail', 'participant_or_room_mirror_error'),
            dead_lettered_at = now(),
            next_attempt_at = now() + interval '1 day'
        WHERE id = r.id;
        v_dlq := v_dlq + 1;
        RAISE WARNING '[PlatformShadow] dead_letter outbox_id=% room_id=% err=%',
          r.id, r.room_id, v_res->>'detail';
      ELSE
        v_backoff := make_interval(
          secs => LEAST(300, (power(2, LEAST(r.retry_count, 8)))::integer)
        );
        UPDATE platform.shadow_outbox
        SET retry_count = r.retry_count + 1,
            last_error = COALESCE(v_res->>'detail', 'participant_or_room_mirror_error'),
            next_attempt_at = now() + v_backoff
        WHERE id = r.id;
        v_err := v_err + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', v_ok,
    'error', v_err,
    'skipped', v_skip,
    'dead_letter', v_dlq
  );
END;
$fn$;

REVOKE ALL ON FUNCTION platform.fn_shadow_drain(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_drain(integer) TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_drain(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Extend reconcile to include participant drift
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_reconcile(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $fn$
DECLARE
  r record;
  v_n int := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 200;
  END IF;

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

      -- Rooms with ticket users missing from session_participants (active tickets)
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

      -- Amount drift on active participants
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

  RETURN jsonb_build_object('enqueued', v_n);
END;
$fn$;

REVOKE ALL ON FUNCTION platform.fn_shadow_reconcile(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_reconcile(integer) TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_reconcile(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Reconciliation report (read-only snapshot for ops / docs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_participant_recon_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $fn$
DECLARE
  v_sessions int;
  v_bingo_users int;
  v_platform_users int;
  v_missing int;
  v_dup int;
  v_status_mismatch int;
  v_amount_mismatch int;
  v_ts_mismatch int;
  v_dlq int;
  v_pending int;
  v_max_retry int;
BEGIN
  SELECT count(*)::int INTO v_sessions
  FROM platform.game_sessions gs
  WHERE gs.correlation_key LIKE 'bingo.room:%';

  SELECT count(*)::int INTO v_bingo_users
  FROM (
    SELECT DISTINCT room_id, player_user_id FROM public.tickets
  ) b;

  SELECT count(*)::int INTO v_platform_users
  FROM platform.session_participants;

  SELECT count(*)::int INTO v_missing
  FROM (
    SELECT DISTINCT t.room_id, t.player_user_id
    FROM public.tickets t
    WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')
  ) b
  WHERE NOT EXISTS (
    SELECT 1 FROM platform.session_participants sp
    WHERE sp.session_id = b.room_id
      AND sp.user_id = b.player_user_id
      AND sp.status IN ('joined', 'active')
  );

  SELECT count(*)::int INTO v_dup
  FROM (
    SELECT session_id, user_id, count(*) AS c
    FROM platform.session_participants
    GROUP BY session_id, user_id
    HAVING count(*) > 1
  ) d;

  SELECT count(*)::int INTO v_status_mismatch
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
    GROUP BY t.room_id, t.player_user_id
  ) e
  JOIN platform.session_participants sp
    ON sp.session_id = e.room_id AND sp.user_id = e.player_user_id
  WHERE sp.status IS DISTINCT FROM e.expected_status;

  SELECT count(*)::int INTO v_amount_mismatch
  FROM (
    SELECT
      t.room_id,
      t.player_user_id,
      coalesce(sum(t.price) FILTER (
        WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')
      ), 0)::numeric(18, 2) AS expected_amount
    FROM public.tickets t
    GROUP BY t.room_id, t.player_user_id
  ) e
  JOIN platform.session_participants sp
    ON sp.session_id = e.room_id AND sp.user_id = e.player_user_id
  WHERE sp.amount_total IS DISTINCT FROM e.expected_amount;

  SELECT count(*)::int INTO v_ts_mismatch
  FROM (
    SELECT t.room_id, t.player_user_id, max(t.updated_at) AS src_updated
    FROM public.tickets t
    GROUP BY t.room_id, t.player_user_id
  ) e
  JOIN platform.session_participants sp
    ON sp.session_id = e.room_id AND sp.user_id = e.player_user_id
  WHERE sp.source_updated_at IS NOT NULL
    AND sp.source_updated_at IS DISTINCT FROM e.src_updated;

  SELECT count(*)::int INTO v_dlq
  FROM platform.shadow_outbox WHERE dead_lettered_at IS NOT NULL;

  SELECT count(*)::int INTO v_pending
  FROM platform.shadow_outbox
  WHERE processed_at IS NULL AND dead_lettered_at IS NULL;

  SELECT coalesce(max(retry_count), 0)::int INTO v_max_retry
  FROM platform.shadow_outbox;

  RETURN jsonb_build_object(
    'sessions_checked', v_sessions,
    'bingo_participant_keys', v_bingo_users,
    'platform_participants', v_platform_users,
    'participants_checked', v_bingo_users,
    'missing', v_missing,
    'duplicate', v_dup,
    'status_mismatch', v_status_mismatch,
    'amount_mismatch', v_amount_mismatch,
    'timestamp_mismatch', v_ts_mismatch,
    'dlq', v_dlq,
    'pending_outbox', v_pending,
    'max_retry_count', v_max_retry,
    'generated_at', now()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION platform.fn_shadow_participant_recon_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_participant_recon_report() TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_participant_recon_report() TO service_role;

-- ---------------------------------------------------------------------------
-- Initial backfill: enqueue rooms that have tickets, then drain
-- ---------------------------------------------------------------------------
INSERT INTO platform.shadow_outbox (room_id)
SELECT DISTINCT t.room_id
FROM public.tickets t
WHERE NOT EXISTS (
  SELECT 1 FROM platform.shadow_outbox o
  WHERE o.room_id = t.room_id
    AND o.processed_at IS NULL
    AND o.dead_lettered_at IS NULL
);

-- shadow_outbox has no unique on room_id — NOT EXISTS guards pending duplicates above

SELECT platform.fn_shadow_drain(5000) AS drain_1;
SELECT platform.fn_shadow_reconcile(5000) AS reconcile_1;
SELECT platform.fn_shadow_drain(5000) AS drain_2;
SELECT platform.fn_shadow_participant_recon_report() AS recon_report;

COMMIT;

-- ROLLBACK (manual):
-- DROP TRIGGER IF EXISTS trg_tickets_platform_shadow ON public.tickets;
-- DROP FUNCTION IF EXISTS platform.trg_tickets_platform_shadow();
-- DROP FUNCTION IF EXISTS platform.fn_shadow_mirror_participants(uuid, integer);
-- DROP FUNCTION IF EXISTS platform.fn_shadow_map_participant_status(integer, boolean, boolean);
-- DROP FUNCTION IF EXISTS platform.fn_shadow_participant_recon_report();
-- Restore prior fn_shadow_drain / fn_shadow_reconcile from P5.4 migration if needed.
-- ALTER TABLE platform.session_participants DROP COLUMN IF EXISTS ticket_count, ...;
