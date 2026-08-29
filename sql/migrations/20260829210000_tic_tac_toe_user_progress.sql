-- Per-user Tic-Tac-Toe difficulty progression (wins/losses, locking, milestone bonus)

BEGIN;

CREATE TABLE IF NOT EXISTS tic_tac_toe.user_progress (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  easy_wins integer NOT NULL DEFAULT 0 CHECK (easy_wins >= 0),
  easy_losses integer NOT NULL DEFAULT 0 CHECK (easy_losses >= 0),
  medium_wins integer NOT NULL DEFAULT 0 CHECK (medium_wins >= 0),
  medium_losses integer NOT NULL DEFAULT 0 CHECK (medium_losses >= 0),
  hard_wins integer NOT NULL DEFAULT 0 CHECK (hard_wins >= 0),
  hard_losses integer NOT NULL DEFAULT 0 CHECK (hard_losses >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_progress_updated_idx
  ON tic_tac_toe.user_progress (updated_at DESC);

COMMENT ON TABLE tic_tac_toe.user_progress IS
  'Per-user win/loss tallies per difficulty; gates difficulty selection and milestone bonuses.';

GRANT SELECT, INSERT, UPDATE, DELETE ON tic_tac_toe.user_progress TO postgres, service_role;

COMMIT;
