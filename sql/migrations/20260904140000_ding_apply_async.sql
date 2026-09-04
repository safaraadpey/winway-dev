-- Phase 2B: async Ding apply via ding_apply_jobs outbox.
-- M2: job enqueue in same txn as draws.processed_at when p_defer_ding=true.
-- M1: tournament accumulation from inserted ding_transactions only.
-- M9: p_defer_ding DEFAULT false — inline Ding unchanged until opt-in.

BEGIN;

-- ---------------------------------------------------------------------------
-- ding_apply_jobs (M3 — dedicated outbox, not draw_jobs)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ding_apply_jobs (
  id            bigserial PRIMARY KEY,
  draw_id       uuid NOT NULL REFERENCES public.draws(id),
  room_id       uuid NOT NULL,
  draw_number   integer NOT NULL,
  ding_per_card integer NOT NULL DEFAULT 0,
  credits       jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  CONSTRAINT ding_apply_jobs_room_draw_unique UNIQUE (room_id, draw_number)
);

CREATE INDEX IF NOT EXISTS ding_apply_jobs_pick_idx
  ON public.ding_apply_jobs (status, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS ding_apply_jobs_stale_processing_idx
  ON public.ding_apply_jobs (status, updated_at)
  WHERE status = 'processing';

ALTER TABLE public.ding_apply_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ding_apply_jobs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ding_apply_jobs TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- rpc_pick_ding_apply_jobs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_pick_ding_apply_jobs(p_limit integer DEFAULT 50)
RETURNS TABLE(
  id bigint,
  draw_id uuid,
  room_id uuid,
  draw_number integer,
  ding_per_card integer,
  credits jsonb,
  status text,
  attempts integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.ding_apply_jobs j
    WHERE j.status = 'queued'
    ORDER BY j.created_at ASC, j.id ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ding_apply_jobs dj
  SET
    status = 'processing',
    updated_at = now()
  FROM picked p
  WHERE dj.id = p.id
    AND dj.status = 'queued'
  RETURNING
    dj.id,
    dj.draw_id,
    dj.room_id,
    dj.draw_number,
    dj.ding_per_card,
    dj.credits,
    dj.status,
    dj.attempts,
    dj.created_at,
    dj.updated_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- rpc_complete_ding_apply_job
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_complete_ding_apply_job(
  p_job_id bigint,
  p_success boolean,
  p_error text DEFAULT NULL,
  p_max_attempts integer DEFAULT 10
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_job public.ding_apply_jobs%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_job
  FROM public.ding_apply_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_success THEN
    UPDATE public.ding_apply_jobs
    SET status = 'done',
        completed_at = v_now,
        updated_at = v_now,
        last_error = NULL
    WHERE id = p_job_id;
    RETURN;
  END IF;

  IF v_job.attempts + 1 >= GREATEST(COALESCE(p_max_attempts, 10), 1) THEN
    UPDATE public.ding_apply_jobs
    SET status = 'failed',
        attempts = v_job.attempts + 1,
        last_error = left(COALESCE(p_error, 'unknown'), 2000),
        updated_at = v_now
    WHERE id = p_job_id;
  ELSE
    UPDATE public.ding_apply_jobs
    SET status = 'queued',
        attempts = v_job.attempts + 1,
        last_error = left(COALESCE(p_error, 'unknown'), 2000),
        updated_at = v_now
    WHERE id = p_job_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- rpc_reap_stale_ding_apply_jobs (M8: mark done when ding_aggregated_at set)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_reap_stale_ding_apply_jobs(
  p_stale_sec integer DEFAULT 120
)
RETURNS TABLE(requeued integer, completed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_cutoff timestamptz := now() - make_interval(secs => GREATEST(COALESCE(p_stale_sec, 120), 1));
  v_requeued integer := 0;
  v_completed integer := 0;
BEGIN
  -- M8: apply already committed — ack without re-applying
  WITH done AS (
    UPDATE public.ding_apply_jobs j
    SET status = 'done',
        completed_at = now(),
        updated_at = now()
    FROM public.draws d
    WHERE j.status = 'processing'
      AND j.updated_at < v_cutoff
      AND d.id = j.draw_id
      AND d.ding_aggregated_at IS NOT NULL
    RETURNING j.id
  )
  SELECT count(*)::integer INTO v_completed FROM done;

  -- Requeue stale processing jobs still needing apply
  WITH requeued_rows AS (
    UPDATE public.ding_apply_jobs j
    SET status = 'queued',
        updated_at = now()
    FROM public.draws d
    WHERE j.status = 'processing'
      AND j.updated_at < v_cutoff
      AND d.id = j.draw_id
      AND d.ding_aggregated_at IS NULL
    RETURNING j.id
  )
  SELECT count(*)::integer INTO v_requeued FROM requeued_rows;

  requeued := v_requeued;
  completed := v_completed;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- rpc_apply_ding_credits_for_draw — M1: tournament from ins RETURNING only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_apply_ding_credits_for_draw(
  p_room_id uuid,
  p_draw_number integer,
  p_ding_per_card integer,
  p_credits jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'tournament', 'pg_temp'
AS $function$
DECLARE
  v_draw public.draws%ROWTYPE;
  v_now timestamptz := now();
  v_credited integer := 0;
BEGIN
  SELECT *
    INTO v_draw
  FROM public.draws
  WHERE room_id = p_room_id
    AND number = p_draw_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_draw.processed_at IS NULL OR v_draw.ding_aggregated_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(p_credits) = 'array' AND jsonb_array_length(p_credits) > 0 THEN
    WITH inc AS (
      SELECT
        (elem->>'user_id')::uuid AS user_id,
        (elem->>'amount')::numeric AS amount,
        COALESCE((elem->>'matched_cards')::integer, 0) AS matched_cards
      FROM jsonb_array_elements(p_credits) AS elem
      WHERE (elem->>'amount')::numeric > 0
    ),
    ins AS (
      INSERT INTO public.ding_transactions (
        user_id,
        room_id,
        ticket_id,
        draw_id,
        drawn_number,
        amount,
        description,
        created_at
      )
      SELECT
        i.user_id,
        p_room_id,
        NULL::uuid,
        v_draw.id,
        p_draw_number,
        i.amount,
        format(
          'Agg ding for draw %s number %s (%s cards x %s)',
          v_draw.id,
          p_draw_number,
          i.matched_cards,
          p_ding_per_card
        ),
        v_now
      FROM inc i
      ON CONFLICT DO NOTHING
      RETURNING user_id, amount
    ),
    upsert_bal AS (
      INSERT INTO public.ding_balances (user_id, balance, updated_at, created_at)
      SELECT
        user_id,
        sum(amount)::numeric,
        v_now,
        v_now
      FROM ins
      GROUP BY user_id
      ON CONFLICT (user_id) DO UPDATE
        SET balance = public.ding_balances.balance + excluded.balance,
            updated_at = v_now
    ),
    tourn AS (
      SELECT tournament.fn_accumulate_player_ding(
        p_room_id,
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object('user_id', user_id, 'amount', amount)
            )
            FROM ins
          ),
          '[]'::jsonb
        )
      )
    )
    SELECT count(DISTINCT ins.user_id)::integer
      INTO v_credited
    FROM ins
    CROSS JOIN tourn;
  END IF;

  UPDATE public.draws
     SET ding_aggregated_at = v_now
   WHERE id = v_draw.id
     AND ding_aggregated_at IS NULL;

  RETURN v_credited;
END;
$function$;

-- ---------------------------------------------------------------------------
-- rpc_finalize_engine_draw_job — p_defer_ding (M2, M4, M9)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_finalize_engine_draw_job(
  bigint, uuid, integer, jsonb, jsonb, boolean, integer, jsonb,
  integer, integer, timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, text, bigint
);

CREATE OR REPLACE FUNCTION public.rpc_finalize_engine_draw_job(
  p_job_id bigint,
  p_room_id uuid,
  p_draw_number integer,
  p_marks jsonb DEFAULT '[]'::jsonb,
  p_results jsonb DEFAULT '[]'::jsonb,
  p_set_first_line_draw_number boolean DEFAULT false,
  p_ding_per_card integer DEFAULT 0,
  p_credits jsonb DEFAULT '[]'::jsonb,
  p_queue_wait_ms integer DEFAULT NULL,
  p_processing_ms integer DEFAULT NULL,
  p_drain_started_at timestamptz DEFAULT NULL,
  p_first_picked_at timestamptz DEFAULT NULL,
  p_handler_started_at timestamptz DEFAULT NULL,
  p_actor_evaluate_started_at timestamptz DEFAULT NULL,
  p_actor_finalize_started_at timestamptz DEFAULT NULL,
  p_owner_id text DEFAULT NULL,
  p_lease_epoch bigint DEFAULT NULL,
  p_defer_ding boolean DEFAULT false
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO public
    AS $$
DECLARE
  v_now timestamptz := now();
  v_rpc_start timestamptz := clock_timestamp();
  v_finalize_ms integer;
  v_credited integer := 0;
  v_room public.rooms%ROWTYPE;
  v_live_actor_owned boolean;
  v_draw_id uuid;
  v_processed_now boolean := false;
BEGIN
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  v_live_actor_owned :=
    v_room.status = 'playing'::public.room_status
    AND v_room.engine_owner_id IS NOT NULL
    AND v_room.engine_lease_until IS NOT NULL
    AND v_room.engine_lease_until > clock_timestamp();

  IF v_live_actor_owned THEN
    IF p_owner_id IS NULL
       OR p_lease_epoch IS NULL
       OR v_room.engine_owner_id IS DISTINCT FROM p_owner_id
       OR v_room.engine_lease_epoch IS DISTINCT FROM p_lease_epoch THEN
      RETURN -1;
    END IF;
  END IF;

  IF jsonb_typeof(p_marks) = 'array' AND jsonb_array_length(p_marks) > 0 THEN
    INSERT INTO marks (ticket_id, value, created_at)
    SELECT
      (elem->>'ticket_id')::uuid,
      (elem->>'value')::integer,
      v_now
    FROM jsonb_array_elements(p_marks) AS elem
    ON CONFLICT (ticket_id, value) DO NOTHING;
  END IF;

  IF jsonb_typeof(p_results) = 'array' AND jsonb_array_length(p_results) > 0 THEN
    INSERT INTO results (room_id, user_id, ticket_id, win_type, draw_number, reward_amount)
    SELECT
      p_room_id,
      (elem->>'user_id')::uuid,
      (elem->>'ticket_id')::uuid,
      elem->>'win_type',
      p_draw_number,
      0
    FROM jsonb_array_elements(p_results) AS elem
    ON CONFLICT (ticket_id, win_type) DO NOTHING;
  END IF;

  IF p_set_first_line_draw_number THEN
    UPDATE rooms
    SET first_line_draw_number = p_draw_number,
        updated_at = v_now
    WHERE id = p_room_id
      AND first_line_draw_number IS NULL;
  END IF;

  UPDATE draw_jobs
  SET status = 'done',
      updated_at = v_now
  WHERE id = p_job_id;

  v_finalize_ms := GREATEST(
    0,
    ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_rpc_start)) * 1000)::integer
  );

  PERFORM 1
  FROM draw_jobs
  WHERE room_id = p_room_id
    AND draw_number = p_draw_number
    AND status <> 'done'
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE draws
    SET processed_at = v_now,
        queue_wait_ms = p_queue_wait_ms,
        processing_ms = p_processing_ms,
        finalize_ms = v_finalize_ms,
        drain_started_at = p_drain_started_at,
        first_picked_at = p_first_picked_at,
        handler_started_at = p_handler_started_at,
        actor_evaluate_started_at = COALESCE(
          p_actor_evaluate_started_at,
          actor_evaluate_started_at
        ),
        actor_finalize_started_at = COALESCE(
          p_actor_finalize_started_at,
          actor_finalize_started_at
        )
    WHERE room_id = p_room_id
      AND number = p_draw_number
      AND processed_at IS NULL
    RETURNING id INTO v_draw_id;

    v_processed_now := FOUND;

    IF NOT v_processed_now THEN
      SELECT id INTO v_draw_id
      FROM draws
      WHERE room_id = p_room_id
        AND number = p_draw_number;
    END IF;
  END IF;

  IF p_defer_ding AND v_processed_now AND v_draw_id IS NOT NULL THEN
    -- M2: enqueue in same txn as processed_at
    INSERT INTO public.ding_apply_jobs (
      draw_id,
      room_id,
      draw_number,
      ding_per_card,
      credits,
      status,
      created_at,
      updated_at
    )
    VALUES (
      v_draw_id,
      p_room_id,
      p_draw_number,
      GREATEST(COALESCE(p_ding_per_card, 0), 0),
      COALESCE(p_credits, '[]'::jsonb),
      'queued',
      v_now,
      v_now
    )
    ON CONFLICT (room_id, draw_number) DO NOTHING;

    RETURN 0;
  END IF;

  IF NOT p_defer_ding THEN
    v_credited := public.rpc_apply_ding_credits_for_draw(
      p_room_id,
      p_draw_number,
      p_ding_per_card,
      p_credits
    );
  END IF;

  RETURN v_credited;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_finalize_engine_draw_job(
  bigint, uuid, integer, jsonb, jsonb, boolean, integer, jsonb,
  integer, integer, timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, text, bigint, boolean
) TO service_role;

-- ---------------------------------------------------------------------------
-- rpc_backfill_missed_engine_ding — skip when job done or aggregated
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_backfill_missed_engine_ding(uuid);

CREATE OR REPLACE FUNCTION public.rpc_backfill_missed_engine_ding(
  p_room_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_room_id uuid,
  draw_number integer,
  users_credited integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_draw record;
  v_ding_per_card integer;
  v_credits jsonb;
  v_credited integer;
BEGIN
  FOR v_draw IN
    SELECT
      d.id AS draw_id,
      d.room_id,
      d.number AS draw_number,
      COALESCE(r.ding_per_number, rt.ding_per_number, 1)::integer AS ding_per_card
    FROM public.draws d
    JOIN public.rooms r ON r.id = d.room_id
    LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE d.processed_at IS NOT NULL
      AND d.ding_aggregated_at IS NULL
      AND (p_room_id IS NULL OR d.room_id = p_room_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.ding_apply_jobs j
        WHERE j.room_id = d.room_id
          AND j.draw_number = d.number
          AND j.status = 'done'
      )
    ORDER BY d.processed_at
  LOOP
    v_ding_per_card := GREATEST(v_draw.ding_per_card, 0);

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', per_user.user_id,
          'amount', per_user.matched_cards * v_ding_per_card,
          'matched_cards', per_user.matched_cards
        )
      ),
      '[]'::jsonb
    )
      INTO v_credits
    FROM (
      SELECT
        t.player_user_id AS user_id,
        count(*)::integer AS matched_cards
      FROM public.marks m
      JOIN public.tickets t ON t.id = m.ticket_id
      WHERE t.room_id = v_draw.room_id
        AND t.cancelled_at IS NULL
        AND m.value = v_draw.draw_number
      GROUP BY t.player_user_id
      HAVING count(*) > 0
    ) per_user;

    IF jsonb_array_length(v_credits) = 0 THEN
      UPDATE public.draws d
         SET ding_aggregated_at = now()
       WHERE d.room_id = v_draw.room_id
         AND d.number = v_draw.draw_number
         AND d.ding_aggregated_at IS NULL;
      v_credited := 0;
    ELSE
      v_credited := public.rpc_apply_ding_credits_for_draw(
        v_draw.room_id,
        v_draw.draw_number,
        v_ding_per_card,
        v_credits
      );
    END IF;

    out_room_id := v_draw.room_id;
    draw_number := v_draw.draw_number;
    users_credited := v_credited;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_backfill_missed_engine_ding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_backfill_missed_engine_ding(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_pick_ding_apply_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_complete_ding_apply_job(bigint, boolean, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_reap_stale_ding_apply_jobs(integer) TO service_role;

COMMENT ON TABLE public.ding_apply_jobs IS
  'Phase 2B async Ding outbox. Enqueued atomically with draws.processed_at when p_defer_ding=true.';

COMMIT;
