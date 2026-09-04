-- Game Manifest (immutable at waiting→playing) + durable shadow replay jobs.
-- Does not change draw/mark/result hot path or fn_finish_room_and_settle body.

BEGIN;

CREATE TABLE IF NOT EXISTS public.game_manifests (
  room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  manifest_version integer NOT NULL DEFAULT 1,
  rng_algorithm text NOT NULL DEFAULT 'SHA256_ORDERING',
  rng_version text NOT NULL DEFAULT 'v1',
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_manifests_rng_algorithm_chk CHECK (rng_algorithm = 'SHA256_ORDERING'),
  CONSTRAINT game_manifests_rng_version_chk CHECK (rng_version = 'v1'),
  CONSTRAINT game_manifests_payload_object_chk CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE IF NOT EXISTS public.game_replay_jobs (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_outcome text
    CHECK (last_outcome IS NULL OR last_outcome IN ('MATCH', 'MISMATCH', 'ERROR')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT game_replay_jobs_room_unique UNIQUE (room_id)
);

CREATE INDEX IF NOT EXISTS game_replay_jobs_pick_idx
  ON public.game_replay_jobs (status, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS game_replay_jobs_stale_processing_idx
  ON public.game_replay_jobs (status, updated_at)
  WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS public.game_replay_audits (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  job_id bigint REFERENCES public.game_replay_jobs(id) ON DELETE SET NULL,
  manifest_version integer,
  rng_version text,
  outcome text NOT NULL CHECK (outcome IN ('MATCH', 'MISMATCH', 'ERROR')),
  draw_diff_count integer NOT NULL DEFAULT 0,
  mark_diff_count integer NOT NULL DEFAULT 0,
  result_diff_count integer NOT NULL DEFAULT 0,
  ding_diff numeric NOT NULL DEFAULT 0,
  winner_mismatch boolean NOT NULL DEFAULT false,
  prize_mismatch boolean NOT NULL DEFAULT false,
  stopped_reason text,
  error_code text,
  replay_duration_ms integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_replay_audits_room_idx
  ON public.game_replay_audits (room_id, created_at DESC);

ALTER TABLE public.game_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_replay_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_replay_audits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.game_manifests FROM PUBLIC;
REVOKE ALL ON TABLE public.game_replay_jobs FROM PUBLIC;
REVOKE ALL ON TABLE public.game_replay_audits FROM PUBLIC;

GRANT SELECT, INSERT ON TABLE public.game_manifests TO service_role, postgres;
GRANT SELECT, INSERT, UPDATE ON TABLE public.game_replay_jobs TO service_role, postgres;
GRANT SELECT, INSERT ON TABLE public.game_replay_audits TO service_role, postgres;
GRANT USAGE, SELECT ON SEQUENCE public.game_replay_jobs_id_seq TO service_role, postgres;
GRANT USAGE, SELECT ON SEQUENCE public.game_replay_audits_id_seq TO service_role, postgres;

CREATE OR REPLACE FUNCTION game_core.fn_forbid_game_manifest_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'game_manifests is immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_game_manifests_no_update ON public.game_manifests;
CREATE TRIGGER trg_game_manifests_no_update
  BEFORE UPDATE ON public.game_manifests
  FOR EACH ROW
  EXECUTE FUNCTION game_core.fn_forbid_game_manifest_update();

CREATE OR REPLACE FUNCTION game_core.fn_insert_game_manifest(p_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, extensions, pg_temp
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_line_pct numeric;
  v_full_pct numeric;
  v_ding integer;
  v_pool_commit text;
  v_pool_prng text;
  v_seed_hex text;
  v_seed_hash text;
  v_ticket_count integer;
  v_missing_comm integer;
  v_missing_cards integer;
  v_payload jsonb;
  v_hash text;
BEGIN
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % not found', p_room;
  END IF;

  IF v_room.room_seed IS NULL THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % has no room_seed', p_room;
  END IF;

  IF v_room.pool_id IS NULL THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % has no pool_id', p_room;
  END IF;

  v_seed_hex := encode(v_room.room_seed, 'hex');
  v_seed_hash := lower(COALESCE(v_room.room_seed_hash, encode(extensions.digest(v_room.room_seed, 'sha256'), 'hex')));
  IF v_seed_hash IS DISTINCT FROM encode(extensions.digest(v_room.room_seed, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % seed hash mismatch', p_room;
  END IF;

  SELECT cp.commit_hash, cp.prng_version
    INTO v_pool_commit, v_pool_prng
  FROM public.card_pools cp
  WHERE cp.id = v_room.pool_id;

  IF v_pool_commit IS NULL THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: pool % not found', v_room.pool_id;
  END IF;

  SELECT COALESCE(r.line_reward_percentage, rt.line_reward_percentage, 0.5),
         COALESCE(r.full_reward_percentage, rt.full_reward_percentage, 0.5),
         GREATEST(COALESCE(r.ding_per_number, rt.ding_per_number, 1)::integer, 0)
    INTO v_line_pct, v_full_pct, v_ding
  FROM public.rooms r
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = p_room;

  v_line_pct := GREATEST(COALESCE(v_line_pct, 0), 0);
  v_full_pct := GREATEST(COALESCE(v_full_pct, 0), 0);
  IF v_line_pct = 0 AND v_full_pct = 0 THEN
    v_line_pct := 0.5;
    v_full_pct := 0.5;
  END IF;
  IF (v_line_pct + v_full_pct) > 1 THEN
    v_line_pct := v_line_pct / (v_line_pct + v_full_pct);
    v_full_pct := 1 - v_line_pct;
  END IF;

  SELECT COUNT(*) INTO v_ticket_count
  FROM public.tickets t
  WHERE t.room_id = p_room
    AND t.cancelled_at IS NULL
    AND t.reservation_status IN ('reserved', 'confirmed');

  IF v_ticket_count < 1 THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % has no eligible tickets', p_room;
  END IF;

  SELECT COUNT(*) INTO v_missing_comm
  FROM public.tickets t
  WHERE t.room_id = p_room
    AND t.cancelled_at IS NULL
    AND t.reservation_status IN ('reserved', 'confirmed')
    AND NOT EXISTS (
      SELECT 1 FROM public.commissions_log c WHERE c.ticket_id = t.id
    );

  IF v_missing_comm > 0 THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % missing commissions_log for % tickets',
      p_room, v_missing_comm;
  END IF;

  SELECT COUNT(*) INTO v_missing_cards
  FROM public.tickets t
  WHERE t.room_id = p_room
    AND t.cancelled_at IS NULL
    AND t.reservation_status IN ('reserved', 'confirmed')
    AND NOT EXISTS (
      SELECT 1 FROM public.card_numbers cn WHERE cn.pool_card_id = t.pool_card_id
    );

  IF v_missing_cards > 0 THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % missing card_numbers for % tickets',
      p_room, v_missing_cards;
  END IF;

  SELECT jsonb_build_object(
    'room_id', p_room,
    'room_seed', v_seed_hex,
    'room_seed_hash', v_seed_hash,
    'rng_algorithm', 'SHA256_ORDERING',
    'rng_version', 'v1',
    'manifest_version', 1,
    'pool_id', v_room.pool_id,
    'pool_commit_hash', v_pool_commit,
    'pool_prng_version', COALESCE(v_pool_prng, 'v1'),
    'ding_per_number', v_ding,
    'line_reward_percentage', v_line_pct,
    'full_reward_percentage', v_full_pct,
    'ding_settle_mode', COALESCE(v_room.ding_settle_mode, 'per_draw'),
    'currency', v_room.currency,
    'card_price', v_room.card_price,
    'commission_pool', (
      SELECT COALESCE(SUM(c.amount_to_pool), 0)
      FROM public.tickets t
      JOIN public.commissions_log c ON c.ticket_id = t.id
      WHERE t.room_id = p_room
        AND t.cancelled_at IS NULL
        AND t.reservation_status IN ('reserved', 'confirmed')
    ),
    'commissions', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'ticket_id', t.id,
          'amount_to_pool', c.amount_to_pool
        ) ORDER BY t.id
      ), '[]'::jsonb)
      FROM public.tickets t
      JOIN public.commissions_log c ON c.ticket_id = t.id
      WHERE t.room_id = p_room
        AND t.cancelled_at IS NULL
        AND t.reservation_status IN ('reserved', 'confirmed')
    ),
    'tickets', (
      SELECT COALESCE(jsonb_agg(ticket_obj ORDER BY ticket_id), '[]'::jsonb)
      FROM (
        SELECT t.id AS ticket_id,
               jsonb_build_object(
                 'ticket_id', t.id,
                 'user_id', t.player_user_id,
                 'pool_card_id', t.pool_card_id::text,
                 'card_no', t.card_no,
                 'price', t.price,
                 'grid_fingerprint', encode(
                   extensions.digest(
                     (
                       SELECT string_agg(
                         cn.row_no::text || ':' || cn.col_no::text || ':' || cn.value::text,
                         ','
                         ORDER BY cn.row_no, cn.col_no, cn.value
                       )
                       FROM public.card_numbers cn
                       WHERE cn.pool_card_id = t.pool_card_id
                     )::bytea,
                     'sha256'
                   ),
                   'hex'
                 )
               ) AS ticket_obj
        FROM public.tickets t
        WHERE t.room_id = p_room
          AND t.cancelled_at IS NULL
          AND t.reservation_status IN ('reserved', 'confirmed')
      ) s
    )
  )
  INTO v_payload;

  v_hash := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO public.game_manifests (
    room_id, manifest_version, rng_algorithm, rng_version, payload, payload_sha256
  ) VALUES (
    p_room, 1, 'SHA256_ORDERING', 'v1', v_payload, v_hash
  );
END;
$$;

CREATE OR REPLACE FUNCTION game_core.fn_enqueue_game_replay_job(p_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.game_manifests WHERE room_id = p_room) THEN
    RETURN;
  END IF;
  INSERT INTO public.game_replay_jobs (room_id, status)
  VALUES (p_room, 'queued')
  ON CONFLICT (room_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION game_core.fn_game_manifest_room_status_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, pg_temp
AS $$
BEGIN
  IF NEW.status = 'playing'::public.room_status
     AND OLD.status IS DISTINCT FROM 'playing'::public.room_status THEN
    IF OLD.status IS DISTINCT FROM 'waiting'::public.room_status THEN
      RAISE EXCEPTION 'game_manifest: refuse playing transition from % for room %',
        OLD.status, NEW.id;
    END IF;
    PERFORM game_core.fn_insert_game_manifest(NEW.id);
  END IF;

  IF NEW.status = 'finished'::public.room_status
     AND OLD.status IS DISTINCT FROM 'finished'::public.room_status THEN
    PERFORM game_core.fn_enqueue_game_replay_job(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_game_manifest_on_room_status ON public.rooms;
CREATE TRIGGER trg_game_manifest_on_room_status
  AFTER UPDATE OF status ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION game_core.fn_game_manifest_room_status_trigger();

CREATE OR REPLACE FUNCTION public.rpc_enqueue_missing_game_replay_jobs(p_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, pg_temp
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  WITH missing AS (
    SELECT r.id
    FROM public.rooms r
    INNER JOIN public.game_manifests m ON m.room_id = r.id
    LEFT JOIN public.game_replay_jobs j ON j.room_id = r.id
    WHERE r.status = 'finished'::public.room_status
      AND j.room_id IS NULL
    ORDER BY r.prize_paid_at NULLS LAST, r.updated_at
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  ),
  ins AS (
    INSERT INTO public.game_replay_jobs (room_id, status)
    SELECT id, 'queued' FROM missing
    ON CONFLICT (room_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_n FROM ins;
  RETURN COALESCE(v_n, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reap_stale_game_replay_jobs(p_stale_sec integer DEFAULT 120)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.game_replay_jobs
     SET status = 'queued',
         updated_at = now(),
         last_error = COALESCE(last_error, 'reaped_stale_processing')
   WHERE status = 'processing'
     AND updated_at < now() - make_interval(secs => GREATEST(COALESCE(p_stale_sec, 120), 30));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN COALESCE(v_n, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_pick_game_replay_jobs(p_limit integer DEFAULT 5)
RETURNS TABLE(
  id bigint,
  room_id uuid,
  status text,
  attempts integer,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.game_replay_jobs j
    WHERE j.status = 'queued'
    ORDER BY j.created_at ASC, j.id ASC
    LIMIT GREATEST(COALESCE(p_limit, 5), 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.game_replay_jobs dj
     SET status = 'processing',
         attempts = dj.attempts + 1,
         updated_at = now()
    FROM picked p
   WHERE dj.id = p.id
     AND dj.status = 'queued'
  RETURNING dj.id, dj.room_id, dj.status, dj.attempts, dj.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_complete_game_replay_job(
  p_job_id bigint,
  p_outcome text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF p_outcome IS DISTINCT FROM 'MATCH'
     AND p_outcome IS DISTINCT FROM 'MISMATCH'
     AND p_outcome IS DISTINCT FROM 'ERROR' THEN
    RAISE EXCEPTION 'rpc_complete_game_replay_job: invalid outcome %', p_outcome;
  END IF;

  UPDATE public.game_replay_jobs
     SET status = 'done',
         last_outcome = p_outcome,
         last_error = p_error,
         completed_at = now(),
         updated_at = now()
   WHERE id = p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_fail_game_replay_job(
  p_job_id bigint,
  p_error text,
  p_max_attempts integer DEFAULT 8
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.game_replay_jobs
     SET status = CASE
           WHEN attempts >= GREATEST(COALESCE(p_max_attempts, 8), 1) THEN 'failed'
           ELSE 'queued'
         END,
         last_error = p_error,
         last_outcome = CASE
           WHEN attempts >= GREATEST(COALESCE(p_max_attempts, 8), 1) THEN 'ERROR'
           ELSE last_outcome
         END,
         updated_at = now()
   WHERE id = p_job_id
     AND status = 'processing';
END;
$$;

CREATE OR REPLACE VIEW public.game_replay_proof_gate AS
SELECT
  COUNT(*) FILTER (WHERE a.outcome = 'MATCH') AS match_count,
  COUNT(*) FILTER (WHERE a.outcome = 'MISMATCH') AS mismatch_count,
  COUNT(*) FILTER (WHERE a.outcome = 'ERROR') AS error_count,
  COUNT(DISTINCT a.room_id) FILTER (WHERE a.outcome = 'MATCH') AS match_rooms,
  MIN(a.created_at) FILTER (WHERE a.outcome IN ('MATCH', 'MISMATCH')) AS first_compared_at,
  MAX(a.created_at) FILTER (WHERE a.outcome IN ('MATCH', 'MISMATCH')) AS last_compared_at,
  2000 AS gate_min_rooms,
  14 AS gate_min_days
FROM public.game_replay_audits a;

REVOKE ALL ON FUNCTION game_core.fn_insert_game_manifest(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION game_core.fn_insert_game_manifest(uuid) TO service_role, postgres;

REVOKE ALL ON FUNCTION game_core.fn_enqueue_game_replay_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION game_core.fn_enqueue_game_replay_job(uuid) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rpc_enqueue_missing_game_replay_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_enqueue_missing_game_replay_jobs(integer) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rpc_reap_stale_game_replay_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_reap_stale_game_replay_jobs(integer) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rpc_pick_game_replay_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_pick_game_replay_jobs(integer) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rpc_complete_game_replay_job(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_complete_game_replay_job(bigint, text, text) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rpc_fail_game_replay_job(bigint, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_fail_game_replay_job(bigint, text, integer) TO service_role, postgres;

GRANT SELECT ON public.game_replay_proof_gate TO service_role, postgres;

COMMIT;
