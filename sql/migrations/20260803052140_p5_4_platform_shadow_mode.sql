-- P5.4 - Platform Session Shadow Mode
-- Scope: Mirror Bingo rooms -> platform.game_sessions (WRITE ONLY projection).
-- Non-goals: no Bingo/wallet/settle/tournament RPC body changes; no production reads of Platform;
--            Platform is never source of truth.
-- Identity: platform.game_sessions.id = public.rooms.id (P5.3).
-- Failure: enqueue/mirror errors are swallowed for Bingo txns; outbox + cron retry.
-- DEV apply note: also applied as MCP chunks p5_4_shadow_* (helpers, tables, trigger, mirror, drain, cron).
-- Rollback: see docs/architecture/p5-4-shadow-mode.md

BEGIN;

-- ---------------------------------------------------------------------------
-- Constants helper: resolve seeded bingo game / engine
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_bingo_ids(OUT game_id uuid, OUT engine_id uuid)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  SELECT g.id INTO game_id FROM platform.games g WHERE g.code = 'bingo';
  SELECT e.id INTO engine_id FROM platform.engine_registry e WHERE e.code = 'bingo-engine';
  IF game_id IS NULL OR engine_id IS NULL THEN
    RAISE EXCEPTION '[PlatformShadow] seeded bingo game/engine missing';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION platform.fn_shadow_bingo_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_bingo_ids() TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_bingo_ids() TO service_role;

-- ---------------------------------------------------------------------------
-- Status alias (Bingo room_status -> Platform lifecycle)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_map_lifecycle(
  p_status text,
  p_lease_owner text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_status IN ('cancelled') THEN 'cancelled'
    WHEN p_status IN ('idle') THEN 'archived'
    WHEN p_status IN ('finished') THEN 'settled'
    WHEN p_status IN ('settling') THEN 'finished'
    WHEN p_status IN ('playing', 'live') THEN 'running'
    WHEN p_status IN ('waiting') AND p_lease_owner IS NOT NULL AND length(trim(p_lease_owner)) > 0
      THEN 'claimed'
    WHEN p_status IN ('waiting') THEN 'waiting'
    ELSE 'created'
  END;
$$;

REVOKE ALL ON FUNCTION platform.fn_shadow_map_lifecycle(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_map_lifecycle(text, text) TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_map_lifecycle(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Outbox + mirror log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.shadow_outbox (
  id              bigserial PRIMARY KEY,
  room_id         uuid NOT NULL,
  enqueued_at     timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  retry_count     integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries     integer NOT NULL DEFAULT 25 CHECK (max_retries > 0),
  last_error      text,
  processed_at    timestamptz,
  dead_lettered_at timestamptz
);

CREATE INDEX IF NOT EXISTS shadow_outbox_pending_idx
  ON platform.shadow_outbox (next_attempt_at, id)
  WHERE processed_at IS NULL AND dead_lettered_at IS NULL;

CREATE INDEX IF NOT EXISTS shadow_outbox_room_pending_idx
  ON platform.shadow_outbox (room_id)
  WHERE processed_at IS NULL AND dead_lettered_at IS NULL;

COMMENT ON TABLE platform.shadow_outbox IS
  'P5.4 Bingo->Platform shadow queue. Worker reads Bingo snapshot; never blocks Bingo money.';

CREATE TABLE IF NOT EXISTS platform.shadow_mirror_log (
  id              bigserial PRIMARY KEY,
  room_id         uuid NOT NULL,
  session_id      uuid NOT NULL,
  lifecycle       text,
  result          text NOT NULL,
  retry_count     integer NOT NULL DEFAULT 0,
  duration_ms     numeric(12, 3),
  detail          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shadow_mirror_log_created_at_idx
  ON platform.shadow_mirror_log (created_at DESC);

CREATE INDEX IF NOT EXISTS shadow_mirror_log_room_id_idx
  ON platform.shadow_mirror_log (room_id, created_at DESC);

COMMENT ON TABLE platform.shadow_mirror_log IS
  'P5.4 observability for shadow mirror ops ([PlatformShadow]).';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shadow_outbox', 'shadow_mirror_log']
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE platform.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE platform.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON TABLE platform.%I FROM authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE platform.%I TO postgres', t);
    EXECUTE format('GRANT ALL ON TABLE platform.%I TO service_role', t);
  END LOOP;
END;
$$;

ALTER TABLE platform.shadow_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.shadow_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.shadow_mirror_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.shadow_mirror_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_shadow_outbox_service_all ON platform.shadow_outbox;
CREATE POLICY platform_shadow_outbox_service_all
  ON platform.shadow_outbox FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS platform_shadow_mirror_log_service_all ON platform.shadow_mirror_log;
CREATE POLICY platform_shadow_mirror_log_service_all
  ON platform.shadow_mirror_log FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT USAGE, SELECT ON SEQUENCE platform.shadow_outbox_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE platform.shadow_mirror_log_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- Enqueue (never raises to Bingo caller)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_enqueue(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $$
BEGIN
  -- Coalesce: if a pending row already exists for this room, skip duplicate.
  IF EXISTS (
    SELECT 1
    FROM platform.shadow_outbox o
    WHERE o.room_id = p_room_id
      AND o.processed_at IS NULL
      AND o.dead_lettered_at IS NULL
  ) THEN
    RETURN;
  END IF;

  INSERT INTO platform.shadow_outbox (room_id) VALUES (p_room_id);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[PlatformShadow] enqueue_failed room_id=% sqlstate=% err=%',
      p_room_id, SQLSTATE, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION platform.fn_shadow_enqueue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_enqueue(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_enqueue(uuid) TO service_role;

CREATE OR REPLACE FUNCTION platform.trg_rooms_platform_shadow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $$
BEGIN
  -- Shadow only - never modify NEW/OLD; never fail Bingo.
  BEGIN
    PERFORM platform.fn_shadow_enqueue(NEW.id);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[PlatformShadow] trigger_enqueue_failed room_id=% sqlstate=% err=%',
        NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION platform.trg_rooms_platform_shadow() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.trg_rooms_platform_shadow() TO postgres;

DROP TRIGGER IF EXISTS trg_rooms_platform_shadow ON public.rooms;
CREATE TRIGGER trg_rooms_platform_shadow
  AFTER INSERT OR UPDATE OF status, engine_owner_id, engine_lease_until, engine_lease_epoch, card_price
  ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION platform.trg_rooms_platform_shadow();

COMMENT ON TRIGGER trg_rooms_platform_shadow ON public.rooms IS
  'P5.4 shadow enqueue only; must not affect Bingo/wallet/settle.';

-- ---------------------------------------------------------------------------
-- Idempotent mirror apply (Bingo snapshot -> Platform)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_mirror_room(
  p_room_id uuid,
  p_retry_count integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_duration_ms numeric(12, 3);
  v_game_id uuid;
  v_engine_id uuid;
  v_room public.rooms%ROWTYPE;
  v_lifecycle text;
  v_prev_lifecycle text;
  v_seq bigint;
  v_result text := 'ok';
  v_detail text := NULL;
BEGIN
  SELECT f.game_id, f.engine_id INTO v_game_id, v_engine_id
  FROM platform.fn_shadow_bingo_ids() AS f;

  SELECT * INTO v_room FROM public.rooms r WHERE r.id = p_room_id;
  IF NOT FOUND THEN
    v_result := 'skipped';
    v_detail := 'room_not_found';
    v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;
    INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
    VALUES (p_room_id, p_room_id, NULL, v_result, p_retry_count, v_duration_ms, v_detail);
    RAISE LOG '[PlatformShadow] room_id=% session_id=% lifecycle=% result=% retry=% duration_ms=% detail=%',
      p_room_id, p_room_id, NULL, v_result, p_retry_count, v_duration_ms, v_detail;
    RETURN jsonb_build_object(
      'room_id', p_room_id,
      'session_id', p_room_id,
      'result', v_result,
      'detail', v_detail,
      'retry_count', p_retry_count,
      'duration_ms', v_duration_ms
    );
  END IF;

  v_lifecycle := platform.fn_shadow_map_lifecycle(v_room.status::text, v_room.engine_owner_id);

  SELECT gs.status INTO v_prev_lifecycle
  FROM platform.game_sessions gs
  WHERE gs.id = p_room_id;

  INSERT INTO platform.game_sessions AS gs (
    id,
    game_id,
    engine_id,
    status,
    capacity,
    participant_count,
    entry_fee,
    currency,
    lease_owner,
    lease_epoch,
    lease_expires_at,
    correlation_key,
    created_at,
    started_at,
    finished_at,
    settled_at,
    updated_at
  )
  VALUES (
    v_room.id,
    v_game_id,
    v_engine_id,
    v_lifecycle,
    NULL,
    0,
    v_room.card_price,
    'IRR',
    v_room.engine_owner_id,
    COALESCE(v_room.engine_lease_epoch, 0),
    v_room.engine_lease_until,
    'bingo.room:' || v_room.id::text,
    v_room.created_at,
    CASE WHEN v_lifecycle IN ('running', 'finished', 'settled', 'archived')
      THEN COALESCE(v_room.waiting_started_at, v_room.created_at) END,
    CASE WHEN v_lifecycle IN ('finished', 'settled', 'archived')
      THEN v_room.updated_at END,
    CASE WHEN v_lifecycle = 'settled' THEN v_room.updated_at END,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    game_id = EXCLUDED.game_id,
    engine_id = EXCLUDED.engine_id,
    status = EXCLUDED.status,
    entry_fee = COALESCE(EXCLUDED.entry_fee, gs.entry_fee),
    lease_owner = EXCLUDED.lease_owner,
    lease_epoch = EXCLUDED.lease_epoch,
    lease_expires_at = EXCLUDED.lease_expires_at,
    correlation_key = COALESCE(gs.correlation_key, EXCLUDED.correlation_key),
    started_at = COALESCE(gs.started_at, EXCLUDED.started_at),
    finished_at = CASE
      WHEN EXCLUDED.status IN ('finished', 'settled', 'archived')
        THEN COALESCE(gs.finished_at, EXCLUDED.finished_at)
      ELSE gs.finished_at
    END,
    settled_at = CASE
      WHEN EXCLUDED.status = 'settled'
        THEN COALESCE(gs.settled_at, EXCLUDED.settled_at)
      ELSE gs.settled_at
    END,
    updated_at = now();

  INSERT INTO platform.session_state AS ss (session_id, state_version, engine_state_ref, needs_settle, metadata, updated_at)
  VALUES (
    v_room.id,
    0,
    'bingo.room:' || v_room.id::text,
    (v_lifecycle = 'finished'),
    jsonb_build_object('bingo_status', v_room.status::text),
    now()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    state_version = ss.state_version + CASE WHEN v_prev_lifecycle IS DISTINCT FROM v_lifecycle THEN 1 ELSE 0 END,
    engine_state_ref = EXCLUDED.engine_state_ref,
    needs_settle = EXCLUDED.needs_settle,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  IF v_lifecycle = 'settled' THEN
    INSERT INTO platform.session_settlement AS st (
      session_id,
      settlement_key,
      status,
      currency,
      lines,
      ledger_refs,
      applied_at,
      updated_at
    )
    VALUES (
      v_room.id,
      'bingo.settle:' || v_room.id::text,
      'applied',
      'IRR',
      '[]'::jsonb,
      '[]'::jsonb,
      v_room.updated_at,
      now()
    )
    ON CONFLICT (session_id, settlement_key) DO UPDATE SET
      status = 'applied',
      applied_at = COALESCE(st.applied_at, EXCLUDED.applied_at),
      updated_at = now();
  END IF;

  IF v_prev_lifecycle IS DISTINCT FROM v_lifecycle THEN
    SELECT COALESCE(MAX(se.seq), 0) + 1 INTO v_seq
    FROM platform.session_events se
    WHERE se.session_id = v_room.id;

    INSERT INTO platform.session_events (session_id, seq, event_type, actor, payload)
    VALUES (
      v_room.id,
      v_seq,
      'shadow.lifecycle',
      'platform-shadow',
      jsonb_build_object(
        'from', v_prev_lifecycle,
        'to', v_lifecycle,
        'bingo_status', v_room.status::text
      )
    )
    ON CONFLICT (session_id, seq) DO NOTHING;
  END IF;

  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;

  INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
  VALUES (v_room.id, v_room.id, v_lifecycle, v_result, p_retry_count, v_duration_ms, v_detail);

  RAISE LOG '[PlatformShadow] room_id=% session_id=% lifecycle=% result=% retry=% duration_ms=%',
    v_room.id, v_room.id, v_lifecycle, v_result, p_retry_count, v_duration_ms;

  RETURN jsonb_build_object(
    'room_id', v_room.id,
    'session_id', v_room.id,
    'lifecycle', v_lifecycle,
    'bingo_status', v_room.status::text,
    'result', v_result,
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
      VALUES (p_room_id, p_room_id, v_lifecycle, v_result, p_retry_count, v_duration_ms, v_detail);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RAISE LOG '[PlatformShadow] room_id=% session_id=% lifecycle=% result=% retry=% duration_ms=% detail=%',
      p_room_id, p_room_id, v_lifecycle, v_result, p_retry_count, v_duration_ms, v_detail;
    RETURN jsonb_build_object(
      'room_id', p_room_id,
      'session_id', p_room_id,
      'lifecycle', v_lifecycle,
      'result', v_result,
      'detail', v_detail,
      'retry_count', p_retry_count,
      'duration_ms', v_duration_ms
    );
END;
$$;

REVOKE ALL ON FUNCTION platform.fn_shadow_mirror_room(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_mirror_room(uuid, integer) TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_mirror_room(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Drain outbox (retry-safe)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_drain(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $$
DECLARE
  r record;
  v_res jsonb;
  v_ok int := 0;
  v_err int := 0;
  v_skip int := 0;
  v_dlq int := 0;
  v_backoff interval;
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

    IF (v_res->>'result') = 'ok' THEN
      UPDATE platform.shadow_outbox
      SET processed_at = now(), last_error = NULL
      WHERE id = r.id;
      v_ok := v_ok + 1;
    ELSIF (v_res->>'result') = 'skipped' THEN
      UPDATE platform.shadow_outbox
      SET processed_at = now(), last_error = v_res->>'detail'
      WHERE id = r.id;
      v_skip := v_skip + 1;
    ELSE
      IF r.retry_count + 1 >= r.max_retries THEN
        UPDATE platform.shadow_outbox
        SET retry_count = r.retry_count + 1,
            last_error = v_res->>'detail',
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
            last_error = v_res->>'detail',
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
$$;

REVOKE ALL ON FUNCTION platform.fn_shadow_drain(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_drain(integer) TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_drain(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Reconcile: enqueue rooms missing/diverged (heals missed events)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_shadow_reconcile(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $$
DECLARE
  r record;
  v_n int := 0;
  v_lifecycle text;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 200;
  END IF;

  FOR r IN
    SELECT rm.id, rm.status::text AS status, rm.engine_owner_id
    FROM public.rooms rm
    LEFT JOIN platform.game_sessions gs ON gs.id = rm.id
    WHERE gs.id IS NULL
       OR gs.status IS DISTINCT FROM platform.fn_shadow_map_lifecycle(rm.status::text, rm.engine_owner_id)
       OR gs.lease_owner IS DISTINCT FROM rm.engine_owner_id
       OR gs.lease_expires_at IS DISTINCT FROM rm.engine_lease_until
    ORDER BY rm.updated_at DESC NULLS LAST
    LIMIT p_limit
  LOOP
    PERFORM platform.fn_shadow_enqueue(r.id);
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('enqueued', v_n);
END;
$$;

REVOKE ALL ON FUNCTION platform.fn_shadow_reconcile(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_reconcile(integer) TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_shadow_reconcile(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Cron: drain + reconcile (does not touch Bingo money paths)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('platform_shadow_drain');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'platform_shadow_drain',
  '10 seconds',
  $$SELECT platform.fn_shadow_drain(100);$$
);

DO $$
BEGIN
  PERFORM cron.unschedule('platform_shadow_reconcile');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'platform_shadow_reconcile',
  '* * * * *',
  $$SELECT platform.fn_shadow_reconcile(200); SELECT platform.fn_shadow_drain(100);$$
);

-- ---------------------------------------------------------------------------
-- Initial backfill enqueue (existing rooms) - no Bingo writes
-- ---------------------------------------------------------------------------
SELECT platform.fn_shadow_reconcile(10000);
SELECT platform.fn_shadow_drain(10000);

COMMIT;

-- ROLLBACK (manual):
-- SELECT cron.unschedule('platform_shadow_drain');
-- SELECT cron.unschedule('platform_shadow_reconcile');
-- DROP TRIGGER IF EXISTS trg_rooms_platform_shadow ON public.rooms;
-- DROP FUNCTION IF EXISTS platform.trg_rooms_platform_shadow();
-- DROP FUNCTION IF EXISTS platform.fn_shadow_drain(integer);
-- DROP FUNCTION IF EXISTS platform.fn_shadow_reconcile(integer);
-- DROP FUNCTION IF EXISTS platform.fn_shadow_mirror_room(uuid, integer);
-- DROP FUNCTION IF EXISTS platform.fn_shadow_enqueue(uuid);
-- DROP FUNCTION IF EXISTS platform.fn_shadow_map_lifecycle(text, text);
-- DROP FUNCTION IF EXISTS platform.fn_shadow_bingo_ids();
-- DROP TABLE IF EXISTS platform.shadow_outbox;
-- DROP TABLE IF EXISTS platform.shadow_mirror_log;
-- Optional: DELETE FROM platform.game_sessions WHERE correlation_key LIKE 'bingo.room:%';
