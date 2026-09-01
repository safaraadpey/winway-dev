-- Per time-band Leo caps split by table stake (light / medium / heavy),
-- matching the player-editor template groups. Shuffle is independent per stake.

BEGIN;

ALTER TABLE public.leo_band_caps
  ADD COLUMN IF NOT EXISTS light_max_active_players integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS light_shuffle_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS medium_max_active_players integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medium_shuffle_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS heavy_max_active_players integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heavy_shuffle_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.leo_band_caps
  DROP CONSTRAINT IF EXISTS leo_band_caps_light_max_active_players_check,
  DROP CONSTRAINT IF EXISTS leo_band_caps_medium_max_active_players_check,
  DROP CONSTRAINT IF EXISTS leo_band_caps_heavy_max_active_players_check;

ALTER TABLE public.leo_band_caps
  ADD CONSTRAINT leo_band_caps_light_max_active_players_check
    CHECK (light_max_active_players >= 0 AND light_max_active_players <= 500),
  ADD CONSTRAINT leo_band_caps_medium_max_active_players_check
    CHECK (medium_max_active_players >= 0 AND medium_max_active_players <= 500),
  ADD CONSTRAINT leo_band_caps_heavy_max_active_players_check
    CHECK (heavy_max_active_players >= 0 AND heavy_max_active_players <= 500);

COMMENT ON COLUMN public.leo_band_caps.light_max_active_players IS
  'Max Leo players for light tables (price < 50000) in this band. 0 = all eligible.';
COMMENT ON COLUMN public.leo_band_caps.medium_max_active_players IS
  'Max Leo players for medium tables (50000 <= price < 200000) in this band. 0 = all eligible.';
COMMENT ON COLUMN public.leo_band_caps.heavy_max_active_players IS
  'Max Leo players for heavy tables (price >= 200000) in this band. 0 = all eligible.';

UPDATE public.leo_band_caps
   SET light_max_active_players = max_active_players,
       light_shuffle_enabled = shuffle_enabled,
       medium_max_active_players = max_active_players,
       medium_shuffle_enabled = shuffle_enabled,
       heavy_max_active_players = max_active_players,
       heavy_shuffle_enabled = shuffle_enabled
 WHERE light_max_active_players = 0
   AND medium_max_active_players = 0
   AND heavy_max_active_players = 0
   AND (max_active_players > 0 OR shuffle_enabled);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'leo_band_rosters'
       AND column_name = 'selected_user_ids'
  ) AND NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'leo_band_rosters'
       AND column_name = 'stake_tier'
  ) THEN
    CREATE TABLE public.leo_band_stake_rosters (
      time_band text NOT NULL
        CHECK (
          time_band IN (
            'midnight','dawn','morning','noon','afternoon','evening'
          )
        ),
      window_date date NOT NULL,
      stake_tier text NOT NULL
        CHECK (stake_tier IN ('light','medium','heavy')),
      shuffle_generation integer NOT NULL DEFAULT 0 CHECK (shuffle_generation >= 0),
      selected_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
      selected_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (time_band, window_date, stake_tier)
    );

    INSERT INTO public.leo_band_stake_rosters (
      time_band, window_date, stake_tier, shuffle_generation,
      selected_user_ids, selected_at, updated_at
    )
    SELECT r.time_band,
           r.window_date,
           t.stake_tier,
           r.shuffle_generation,
           r.selected_user_ids,
           r.selected_at,
           r.updated_at
      FROM public.leo_band_rosters r
      CROSS JOIN (VALUES ('light'), ('medium'), ('heavy')) AS t(stake_tier);

    DROP TABLE public.leo_band_rosters;
    ALTER TABLE public.leo_band_stake_rosters RENAME TO leo_band_rosters;
  END IF;
END $$;

COMMENT ON TABLE public.leo_band_rosters IS
  'Selected Leo roster per Tehran window + time band + stake tier. Independent 90-minute shuffle.';

REVOKE ALL ON TABLE public.leo_band_rosters FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leo_band_rosters TO service_role, postgres;

COMMIT;
