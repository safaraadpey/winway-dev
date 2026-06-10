-- Per-template active room count gates for dev player joins
BEGIN;

CREATE TABLE IF NOT EXISTS public.dev_player_template_room_limits (
  template_id uuid PRIMARY KEY REFERENCES public.room_templates(id) ON DELETE CASCADE,
  min_active_rooms integer,
  max_active_rooms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dev_player_template_room_limits_min_check
    CHECK (min_active_rooms IS NULL OR min_active_rooms >= 0),
  CONSTRAINT dev_player_template_room_limits_max_check
    CHECK (max_active_rooms IS NULL OR max_active_rooms >= 0),
  CONSTRAINT dev_player_template_room_limits_range_check
    CHECK (
      min_active_rooms IS NULL
      OR max_active_rooms IS NULL
      OR min_active_rooms <= max_active_rooms
    ),
  CONSTRAINT dev_player_template_room_limits_has_value_check
    CHECK (min_active_rooms IS NOT NULL OR max_active_rooms IS NOT NULL)
);

COMMENT ON TABLE public.dev_player_template_room_limits IS
  'Per-template min/max active room (waiting/playing) window before dev players may join.';

ALTER TABLE public.dev_player_template_room_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_dev_player_template_room_limits_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev_player_template_room_limits_updated_at
  ON public.dev_player_template_room_limits;
CREATE TRIGGER trg_dev_player_template_room_limits_updated_at
  BEFORE UPDATE ON public.dev_player_template_room_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dev_player_template_room_limits_updated_at();

-- Drop legacy global columns (replaced by per-template table)
ALTER TABLE public.dev_player_settings
  DROP CONSTRAINT IF EXISTS dev_player_settings_active_rooms_range_check;

ALTER TABLE public.dev_player_settings
  DROP COLUMN IF EXISTS min_active_rooms_per_template,
  DROP COLUMN IF EXISTS max_active_rooms_per_template;

COMMIT;
