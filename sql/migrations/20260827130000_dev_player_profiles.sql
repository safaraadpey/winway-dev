-- Dev Player named profiles: time window, discrete template prices, member assignment.
-- Per-player play_windows / min/max price in dev_player_configs are no longer used for Join.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dev_player_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  allowed_prices numeric[] NOT NULL DEFAULT '{}'::numeric[],
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dev_player_profiles_name_check CHECK (length(trim(name)) > 0),
  CONSTRAINT dev_player_profiles_start_time_check CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT dev_player_profiles_end_time_check CHECK (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT dev_player_profiles_time_order_check CHECK (start_time < end_time)
);

COMMENT ON TABLE public.dev_player_profiles IS
  'Named Dev Player profiles: daily play window and allowed discrete room template prices.';

COMMENT ON COLUMN public.dev_player_profiles.start_time IS
  'Daily window start (HH:MM, local app timezone).';

COMMENT ON COLUMN public.dev_player_profiles.end_time IS
  'Daily window end (HH:MM, local app timezone). Must be after start_time.';

COMMENT ON COLUMN public.dev_player_profiles.allowed_prices IS
  'Discrete room template prices a member may join when this profile is active.';

CREATE TABLE IF NOT EXISTS public.dev_player_profile_members (
  profile_id uuid NOT NULL REFERENCES public.dev_player_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dev_player_profile_members_pkey PRIMARY KEY (profile_id, user_id)
);

COMMENT ON TABLE public.dev_player_profile_members IS
  'Players assigned to a Dev Player profile. A player may belong to multiple profiles.';

CREATE INDEX IF NOT EXISTS idx_dev_player_profile_members_user_id
  ON public.dev_player_profile_members (user_id);

ALTER TABLE public.dev_player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_player_profile_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_dev_player_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev_player_profiles_updated_at ON public.dev_player_profiles;
CREATE TRIGGER trg_dev_player_profiles_updated_at
  BEFORE UPDATE ON public.dev_player_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dev_player_profiles_updated_at();

COMMIT;
