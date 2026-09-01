-- Leo: per time-band active player cap + optional 90-minute roster shuffle.

BEGIN;

CREATE TABLE IF NOT EXISTS public.leo_band_caps (
  time_band text PRIMARY KEY
    CHECK (
      time_band IN (
        'midnight','dawn','morning','noon','afternoon','evening'
      )
    ),
  max_active_players integer NOT NULL DEFAULT 0
    CHECK (max_active_players >= 0 AND max_active_players <= 500),
  shuffle_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leo_band_caps IS
  'Engine-wide cap of how many Leo-enabled players may run in each time band. 0 = all eligible.';
COMMENT ON COLUMN public.leo_band_caps.max_active_players IS
  'Max players the scheduler may activate in this band. 0 = no cap.';
COMMENT ON COLUMN public.leo_band_caps.shuffle_enabled IS
  'When true, scheduler reshuffles the selected roster every 90 minutes.';

INSERT INTO public.leo_band_caps (time_band)
VALUES ('midnight'), ('dawn'), ('morning'), ('noon'), ('afternoon'), ('evening')
ON CONFLICT (time_band) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.leo_band_rosters (
  time_band text NOT NULL
    CHECK (
      time_band IN (
        'midnight','dawn','morning','noon','afternoon','evening'
      )
    ),
  window_date date NOT NULL,
  shuffle_generation integer NOT NULL DEFAULT 0 CHECK (shuffle_generation >= 0),
  selected_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  selected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (time_band, window_date)
);

COMMENT ON TABLE public.leo_band_rosters IS
  'Selected Leo player roster for a Tehran window date + time band. Rewritten on cap change or shuffle.';

REVOKE ALL ON TABLE public.leo_band_caps FROM PUBLIC;
REVOKE ALL ON TABLE public.leo_band_rosters FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leo_band_caps TO service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leo_band_rosters TO service_role, postgres;

COMMIT;
