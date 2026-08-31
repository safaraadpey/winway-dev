-- Leo Behavior Engine: settings, per-user config, execution queue, session runtime.

BEGIN;

CREATE TABLE IF NOT EXISTS public.leo_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  system_enabled boolean NOT NULL DEFAULT false,
  scheduler_enabled boolean NOT NULL DEFAULT false,
  scheduler_tick_seconds integer NOT NULL DEFAULT 60
    CHECK (scheduler_tick_seconds BETWEEN 5 AND 3600),
  processor_tick_seconds integer NOT NULL DEFAULT 30
    CHECK (processor_tick_seconds BETWEEN 5 AND 3600),
  timezone text NOT NULL DEFAULT 'Asia/Tehran',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.leo_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.leo_user_configs (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  active_time_bands text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (
      active_time_bands <@ ARRAY[
        'midnight','dawn','morning','noon','afternoon','evening'
      ]::text[]
    ),
  behavior_profile text NOT NULL DEFAULT 'methodical'
    CHECK (behavior_profile IN (
      'methodical','emotional','hot_hand','distracted','cautious'
    )),
  session_budget numeric NOT NULL DEFAULT 0 CHECK (session_budget >= 0),
  hard_stop_loss numeric NOT NULL DEFAULT 0 CHECK (hard_stop_loss >= 0),
  preferred_template_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  random_template_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS leo_user_configs_enabled_idx
  ON public.leo_user_configs (is_enabled)
  WHERE is_enabled = true;

CREATE TABLE IF NOT EXISTS public.leo_execution_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  window_date date NOT NULL,
  window_band text NOT NULL
    CHECK (window_band IN (
      'midnight','dawn','morning','noon','afternoon','evening'
    )),
  sequence_no integer NOT NULL CHECK (sequence_no >= 0),
  event_type text NOT NULL
    CHECK (event_type IN (
      'enter','session_start','round_join','break','exit','skip'
    )),
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending','processing','done','failed','cancelled','skipped'
    )),
  session_index integer NOT NULL DEFAULT -1,
  table_pool_source text CHECK (table_pool_source IN ('preferred','random')),
  template_id uuid REFERENCES public.room_templates(id) ON DELETE SET NULL,
  card_count integer CHECK (card_count IS NULL OR card_count >= 1),
  round_delay_seconds integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS leo_execution_queue_window_seq_uidx
  ON public.leo_execution_queue (user_id, window_date, window_band, sequence_no);

CREATE INDEX IF NOT EXISTS leo_execution_queue_pick_idx
  ON public.leo_execution_queue (status, scheduled_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.leo_session_runtime (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  window_key text NOT NULL,
  session_index integer NOT NULL DEFAULT 0,
  session_spend numeric NOT NULL DEFAULT 0,
  session_pnl numeric NOT NULL DEFAULT 0,
  consecutive_losses integer NOT NULL DEFAULT 0,
  consecutive_wins integer NOT NULL DEFAULT 0,
  rounds_played integer NOT NULL DEFAULT 0,
  fatigue numeric NOT NULL DEFAULT 0,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, window_key, session_index)
);

CREATE OR REPLACE FUNCTION public.fn_user_has_active_dev_player(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.dev_player_configs c
     WHERE c.user_id = p_user_id
       AND c.is_enabled = true
  )
  OR EXISTS (
    SELECT 1
      FROM public.dev_player_profile_members m
      JOIN public.dev_player_profiles p ON p.id = m.profile_id
     WHERE m.user_id = p_user_id
       AND p.engine_enabled = true
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_pick_leo_execution_queue(p_limit integer DEFAULT 20)
RETURNS SETOF public.leo_execution_queue
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT q.id
      FROM public.leo_execution_queue q
     WHERE q.status = 'pending'
       AND q.scheduled_at <= now()
     ORDER BY q.scheduled_at ASC
     LIMIT GREATEST(1, LEAST(p_limit, 200))
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.leo_execution_queue q
     SET status = 'processing',
         updated_at = now()
    FROM picked
   WHERE q.id = picked.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON TABLE public.leo_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.leo_user_configs FROM PUBLIC;
REVOKE ALL ON TABLE public.leo_execution_queue FROM PUBLIC;
REVOKE ALL ON TABLE public.leo_session_runtime FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leo_settings TO service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leo_user_configs TO service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leo_execution_queue TO service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leo_session_runtime TO service_role, postgres;

GRANT EXECUTE ON FUNCTION public.fn_user_has_active_dev_player(uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_pick_leo_execution_queue(integer) TO service_role, postgres;

COMMIT;
