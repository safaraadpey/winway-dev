-- manifest_ram shadow replay audit alignment — new audit dimensions only.
BEGIN;

ALTER TABLE public.game_replay_audits
  ADD COLUMN IF NOT EXISTS unexpected_per_draw_writes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finalization_checksum_mismatch boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.game_replay_audits.unexpected_per_draw_writes IS
  'manifest_ram: draws/marks/draw_jobs/ding_apply_jobs created before final settlement boundary';

COMMENT ON COLUMN public.game_replay_audits.finalization_checksum_mismatch IS
  'manifest_ram: stored rooms.finalization_sha256 differs from replayGame checksum';

COMMIT;
