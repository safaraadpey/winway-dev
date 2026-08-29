-- Track easy tier clearance separately so medium penalty can reopen easy without locking medium/hard

BEGIN;

ALTER TABLE tic_tac_toe.user_progress
  ADD COLUMN IF NOT EXISTS easy_cleared boolean NOT NULL DEFAULT false;

UPDATE tic_tac_toe.user_progress
SET easy_cleared = true
WHERE easy_wins >= 7;

COMMIT;
