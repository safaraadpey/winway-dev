-- Dev player profiles: support multiple daily play windows per profile.

BEGIN;

ALTER TABLE public.dev_player_profiles
  ADD COLUMN IF NOT EXISTS play_windows jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.dev_player_profiles
SET play_windows = jsonb_build_array(
  jsonb_build_object('start', start_time, 'end', end_time)
)
WHERE jsonb_array_length(play_windows) = 0
  AND start_time IS NOT NULL
  AND end_time IS NOT NULL;

ALTER TABLE public.dev_player_profiles
  DROP CONSTRAINT IF EXISTS dev_player_profiles_start_time_check;

ALTER TABLE public.dev_player_profiles
  DROP CONSTRAINT IF EXISTS dev_player_profiles_end_time_check;

ALTER TABLE public.dev_player_profiles
  DROP CONSTRAINT IF EXISTS dev_player_profiles_time_order_check;

ALTER TABLE public.dev_player_profiles
  DROP COLUMN IF EXISTS start_time;

ALTER TABLE public.dev_player_profiles
  DROP COLUMN IF EXISTS end_time;

COMMENT ON COLUMN public.dev_player_profiles.play_windows IS
  'JSON array of {start,end} HH:MM strings in local app timezone. At least one window required.';

COMMIT;
