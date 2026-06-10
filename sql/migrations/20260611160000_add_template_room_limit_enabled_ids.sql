-- Enabled templates for per-template active room limit gates
BEGIN;

ALTER TABLE public.dev_player_settings
  ADD COLUMN IF NOT EXISTS template_room_limit_enabled_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.dev_player_settings.template_room_limit_enabled_ids IS
  'Templates included in dev player active-room limit checks (Dev Panel checkbox list).';

COMMIT;
