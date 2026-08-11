-- Dev Player Hybrid Activity Strategy v1: persisted behavior cycle metadata (counter-based).
BEGIN;

ALTER TABLE public.dev_player_settings
  ADD COLUMN IF NOT EXISTS scheduler_behavior_state jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.dev_player_settings.scheduler_behavior_state IS
  'Counter-based scheduler v1: cycleStartedAt, cycleEndsAt, per-template mode/counters (not full action plans).';

COMMIT;
