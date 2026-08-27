-- Per-template random join delay (0..join_delay_max_seconds) for profile-only Dev Player engine.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dev_player_template_join_settings (
  template_id uuid PRIMARY KEY REFERENCES public.room_templates(id) ON DELETE CASCADE,
  join_delay_max_seconds integer NOT NULL DEFAULT 20,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT dev_player_template_join_settings_delay_check
    CHECK (join_delay_max_seconds >= 0 AND join_delay_max_seconds <= 7200)
);

COMMENT ON TABLE public.dev_player_template_join_settings IS
  'Max seconds for random join delay (0..max) per room template in Dev Player scheduler.';
COMMENT ON COLUMN public.dev_player_template_join_settings.join_delay_max_seconds IS
  'Engine rolls randomInt(0, join_delay_max_seconds) and sets dev_room_schedules.scheduled_at accordingly.';

COMMIT;
