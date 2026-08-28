-- Move default Tic-Tac-Toe launcher placement to player settings only

BEGIN;

UPDATE tic_tac_toe.settings
SET placements = '["player_settings"]'::jsonb,
    updated_at = now()
WHERE id = 1;

COMMIT;
