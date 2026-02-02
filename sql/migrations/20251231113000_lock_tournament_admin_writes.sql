BEGIN;

-- Ensure schema exists for tournament RPCs.
CREATE SCHEMA IF NOT EXISTS tournament;

-- Lock down direct table writes; prefer RPCs.
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'tournaments_select_authenticated'
      AND schemaname = 'public'
      AND tablename = 'tournaments'
  ) THEN
    CREATE POLICY tournaments_select_authenticated
      ON public.tournaments
      FOR SELECT
      USING (
        auth.role() IN ('authenticated','service_role')
        AND EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid()
            AND u.status = 'active'
        )
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'tournaments_insert_admin'
      AND schemaname = 'public'
      AND tablename = 'tournaments'
  ) THEN
    CREATE POLICY tournaments_insert_admin
      ON public.tournaments
      FOR INSERT
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid()
            AND u.role IN ('admin','super')
            AND u.status = 'active'
        )
      );
  END IF;
END$$;

-- Remove direct table write privileges from client roles (RLS will also block).
REVOKE INSERT, UPDATE, DELETE ON public.tournaments FROM anon, authenticated;

-- RPC: guarded admin update that enforces locked statuses.
CREATE OR REPLACE FUNCTION tournament.fn_admin_update_tournament(
  p_tournament_id uuid,
  p_patch jsonb
) RETURNS public.tournaments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public, pg_temp
AS $$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_row           public.tournaments%ROWTYPE;
  v_now           timestamptz := now();
  v_allowed_keys  text[] := ARRAY[
    'title','start_at','currency','ticket_price','min_tickets_per_player',
    'max_tickets_per_player','table_size_mode','table_size_fixed','table_size_min',
    'table_size_max','remainder_policy','guaranteed_prize','commission_rate','meta'
  ];
  v_bad_keys      text[];
BEGIN
  p_patch := COALESCE(p_patch, '{}'::jsonb);

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_tournament_id IS NULL THEN
    RAISE EXCEPTION 'tournament_id is required';
  END IF;

  SELECT *
    INTO v_row
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF v_row.status IN ('running','settling','finished') THEN
    RAISE EXCEPTION 'tournament is locked';
  END IF;

  v_bad_keys := (
    SELECT ARRAY_AGG(k)
    FROM jsonb_object_keys(p_patch) AS k
    WHERE k <> ALL (v_allowed_keys)
  );
  IF v_bad_keys IS NOT NULL THEN
    RAISE EXCEPTION 'unsupported keys: %', v_bad_keys;
  END IF;

  IF p_patch ? 'status' THEN
    RAISE EXCEPTION 'status cannot be changed via this RPC';
  END IF;

  UPDATE public.tournaments t
     SET title                   = COALESCE(p_patch->>'title', t.title),
         start_at                = COALESCE((p_patch->>'start_at')::timestamptz, t.start_at),
         currency                = COALESCE(p_patch->>'currency', t.currency),
         ticket_price            = COALESCE(NULLIF(p_patch->>'ticket_price','')::numeric, t.ticket_price),
         min_tickets_per_player  = COALESCE(NULLIF(p_patch->>'min_tickets_per_player','')::int, t.min_tickets_per_player),
         max_tickets_per_player  = COALESCE(NULLIF(p_patch->>'max_tickets_per_player','')::int, t.max_tickets_per_player),
         table_size_mode         = COALESCE(
                                    NULLIF(p_patch->>'table_size_mode','')::public.tournament_table_size_mode,
                                    t.table_size_mode
                                  ),
         table_size_fixed        = COALESCE(NULLIF(p_patch->>'table_size_fixed','')::int, t.table_size_fixed),
         table_size_min          = COALESCE(NULLIF(p_patch->>'table_size_min','')::int, t.table_size_min),
         table_size_max          = COALESCE(NULLIF(p_patch->>'table_size_max','')::int, t.table_size_max),
         remainder_policy        = COALESCE(
                                    NULLIF(p_patch->>'remainder_policy','')::public.tournament_remainder_policy,
                                    t.remainder_policy
                                  ),
         commission_rate         = COALESCE(NULLIF(p_patch->>'commission_rate','')::numeric, t.commission_rate),
         guaranteed_prize        = COALESCE(NULLIF(p_patch->>'guaranteed_prize','')::numeric, t.guaranteed_prize),
         meta                    = CASE
                                     WHEN p_patch ? 'meta' THEN COALESCE(t.meta, '{}'::jsonb) || COALESCE(p_patch->'meta','{}'::jsonb)
                                     ELSE t.meta
                                   END,
         updated_at              = v_now
   WHERE t.id = p_tournament_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION tournament.fn_admin_update_tournament(uuid, jsonb) TO authenticated;

-- Public wrapper for Supabase RPC (functions in non-public schemas are not exposed).
CREATE OR REPLACE FUNCTION public.fn_admin_update_tournament(
  p_tournament_id uuid,
  p_patch jsonb
) RETURNS public.tournaments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public, pg_temp
AS $$
BEGIN
  RETURN tournament.fn_admin_update_tournament(p_tournament_id, p_patch);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_admin_update_tournament(uuid, jsonb) TO authenticated;

-- RPC: controlled status transitions for admins.
CREATE OR REPLACE FUNCTION tournament.fn_admin_set_tournament_status(
  p_tournament_id uuid,
  p_status public.tournament_status
) RETURNS public.tournaments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public, pg_temp
AS $$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_row           public.tournaments%ROWTYPE;
  v_now           timestamptz := now();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT *
    INTO v_row
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF p_status IS NULL THEN
    RAISE EXCEPTION 'status is required';
  END IF;

  -- Allowed transitions:
  -- draft -> registration_open | cancelled
  -- registration_open -> cancelled
  IF v_row.status = 'draft' AND p_status IN ('registration_open','cancelled') THEN
    NULL;
  ELSIF v_row.status = 'registration_open' AND p_status = 'cancelled' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'invalid status transition from % to %', v_row.status, p_status;
  END IF;

  UPDATE public.tournaments t
     SET status     = p_status,
         updated_at = v_now
   WHERE t.id = p_tournament_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION tournament.fn_admin_set_tournament_status(uuid, public.tournament_status) TO authenticated;

-- Public wrapper for Supabase RPC exposure.
CREATE OR REPLACE FUNCTION public.fn_admin_set_tournament_status(
  p_tournament_id uuid,
  p_status public.tournament_status
) RETURNS public.tournaments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public, pg_temp
AS $$
BEGIN
  RETURN tournament.fn_admin_set_tournament_status(p_tournament_id, p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_admin_set_tournament_status(uuid, public.tournament_status) TO authenticated;

-- RPC: delete a cancelled tournament (hard delete).
CREATE OR REPLACE FUNCTION tournament.fn_admin_delete_tournament(
  p_tournament_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public, pg_temp
AS $$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_status        public.tournament_status;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT status
    INTO v_status
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'only cancelled tournaments can be deleted';
  END IF;

  DELETE FROM public.tournaments
  WHERE id = p_tournament_id;
END;
$$;

GRANT EXECUTE ON FUNCTION tournament.fn_admin_delete_tournament(uuid) TO authenticated;

-- Public wrapper for delete RPC.
CREATE OR REPLACE FUNCTION public.fn_admin_delete_tournament(
  p_tournament_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public, pg_temp
AS $$
BEGIN
  PERFORM tournament.fn_admin_delete_tournament(p_tournament_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_admin_delete_tournament(uuid) TO authenticated;

-- RPC: create tournament (admin only).
CREATE OR REPLACE FUNCTION tournament.fn_admin_create_tournament(
  p_payload jsonb
) RETURNS public.tournaments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public, pg_temp
AS $$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_now           timestamptz := now();
  v_row           public.tournaments%ROWTYPE;
  v_status        public.tournament_status := COALESCE(
                         NULLIF(p_payload->>'status','')::public.tournament_status,
                         'draft'::public.tournament_status
                       );
  v_final_winners int := NULLIF(p_payload->>'final_winners_count','')::int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF v_status NOT IN ('draft','registration_open') THEN
    RAISE EXCEPTION 'invalid initial status';
  END IF;

  IF v_final_winners IS NOT NULL AND (v_final_winners < 1 OR v_final_winners > 4) THEN
    RAISE EXCEPTION 'final_winners_count must be between 1 and 4';
  END IF;

  INSERT INTO public.tournaments(
    title,
    status,
    start_at,
    currency,
    ticket_price,
    min_tickets_per_player,
    max_tickets_per_player,
    table_size_mode,
    table_size_fixed,
    table_size_min,
    table_size_max,
    remainder_policy,
    commission_rate,
    guaranteed_prize,
    meta,
    created_at,
    updated_at
  )
  VALUES (
    p_payload->>'title',
    v_status,
    NULLIF(p_payload->>'start_at','')::timestamptz,
    COALESCE(p_payload->>'currency','IRR'),
    NULLIF(p_payload->>'ticket_price','')::numeric,
    NULLIF(p_payload->>'min_tickets_per_player','')::int,
    NULLIF(p_payload->>'max_tickets_per_player','')::int,
    COALESCE(NULLIF(p_payload->>'table_size_mode','')::public.tournament_table_size_mode, 'fixed'),
    NULLIF(p_payload->>'table_size_fixed','')::int,
    NULLIF(p_payload->>'table_size_min','')::int,
    NULLIF(p_payload->>'table_size_max','')::int,
    COALESCE(NULLIF(p_payload->>'remainder_policy','')::public.tournament_remainder_policy, 'adaptive_tables'),
    NULLIF(p_payload->>'commission_rate','')::numeric,
    NULLIF(p_payload->>'guaranteed_prize','')::numeric,
    CASE
      WHEN v_final_winners IS NULL THEN NULL
      ELSE jsonb_build_object('final_winners_count', v_final_winners)
    END,
    v_now,
    v_now
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION tournament.fn_admin_create_tournament(jsonb) TO authenticated;

-- Public wrapper for create RPC.
CREATE OR REPLACE FUNCTION public.fn_admin_create_tournament(
  p_payload jsonb
) RETURNS public.tournaments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public, pg_temp
AS $$
BEGIN
  RETURN tournament.fn_admin_create_tournament(p_payload);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_admin_create_tournament(jsonb) TO authenticated;

-- Tick/orchestrator functions should remain service-only.
REVOKE EXECUTE ON FUNCTION tournament.fn_manage_tournament_cycle(uuid, bigint) FROM anon, authenticated;

COMMIT;

