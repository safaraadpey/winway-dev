-- Enable Tic-Tac-Toe mini game for player settings entry (idempotent)

BEGIN;

UPDATE public.features
SET is_enabled = true,
    default_enabled = true,
    updated_at = now()
WHERE key = 'tic_tac_toe';

UPDATE tic_tac_toe.settings
SET is_enabled = true,
    placements = '["player_settings"]'::jsonb,
    updated_at = now()
WHERE id = 1;

COMMIT;
