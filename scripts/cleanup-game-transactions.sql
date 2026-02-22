-- Run this in Supabase Dashboard → SQL Editor (long timeout recommended).
-- Deletes remaining game-related transactions in batches.

SET statement_timeout = 0;

DO $$
DECLARE
  r int;
  total bigint := 0;
BEGIN
  LOOP
    WITH d AS (
      DELETE FROM transactions
      WHERE ctid IN (
        SELECT ctid FROM transactions
        WHERE related_room IS NOT NULL OR room_id IS NOT NULL OR ticket_id IS NOT NULL
           OR source_room_id IS NOT NULL OR source_ticket_id IS NOT NULL
        LIMIT 50000
      )
      RETURNING 1
    )
    SELECT count(*)::int INTO r FROM d;
    total := total + r;
    RAISE NOTICE 'Deleted batch: %, total so far: %', r, total;
    EXIT WHEN r = 0;
  END LOOP;
  RAISE NOTICE 'Done. Total deleted: %', total;
END $$;
