-- Dev player behavior configs (managed from Dev Panel)
BEGIN;

CREATE TABLE IF NOT EXISTS public.dev_player_configs (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  play_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
  min_room_price numeric,
  max_room_price numeric,
  max_ticket_count integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dev_player_configs_max_ticket_count_check CHECK (max_ticket_count > 0),
  CONSTRAINT dev_player_configs_price_range_check CHECK (
    min_room_price IS NULL
    OR max_room_price IS NULL
    OR min_room_price <= max_room_price
  )
);

COMMENT ON TABLE public.dev_player_configs IS
  'Per-user dev player behavior for Dev Panel: play windows, room price bounds, max tickets.';
COMMENT ON COLUMN public.dev_player_configs.play_windows IS
  'JSON array of {start,end} HH:MM strings in local app timezone.';
COMMENT ON COLUMN public.dev_player_configs.is_enabled IS
  'When true, user is treated as an active dev player.';

CREATE INDEX IF NOT EXISTS idx_dev_player_configs_enabled
  ON public.dev_player_configs (is_enabled)
  WHERE is_enabled = true;

ALTER TABLE public.dev_player_configs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_dev_player_configs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev_player_configs_updated_at ON public.dev_player_configs;
CREATE TRIGGER trg_dev_player_configs_updated_at
  BEFORE UPDATE ON public.dev_player_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dev_player_configs_updated_at();

COMMIT;
