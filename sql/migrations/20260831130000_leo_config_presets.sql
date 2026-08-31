-- Leo config presets: reusable saved settings for Dev Panel.

BEGIN;

CREATE TABLE IF NOT EXISTS public.leo_config_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
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
  max_concurrent_tables integer NOT NULL DEFAULT 0 CHECK (max_concurrent_tables >= 0),
  preferred_template_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  random_template_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT leo_config_presets_name_check CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS leo_config_presets_name_uidx
  ON public.leo_config_presets (lower(trim(name)));

COMMENT ON TABLE public.leo_config_presets IS
  'Reusable Leo behavior config presets for Dev Panel copy/apply workflow.';

REVOKE ALL ON TABLE public.leo_config_presets FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leo_config_presets TO service_role, postgres;

COMMIT;
