-- Migration: Stage 1 room status refactor
-- Date: 2025-12-02

-- 1) Add settling status if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'room_status'
      AND e.enumlabel = 'settling'
  ) THEN
    ALTER TYPE public.room_status ADD VALUE 'settling';
  END IF;
END;
$$;

BEGIN;

-- 2) Normalize existing rows and defaults
UPDATE public.rooms
   SET status = 'playing'::public.room_status
 WHERE status = 'live'::public.room_status;

ALTER TABLE public.rooms
  ALTER COLUMN status SET DEFAULT 'waiting'::public.room_status;

-- 3) Refresh constraint that requires pool_id for active states
ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS room_pool_required_chk;

ALTER TABLE public.rooms
  ADD CONSTRAINT room_pool_required_chk
  CHECK (
    status NOT IN ('waiting'::public.room_status,
                   'playing'::public.room_status,
                   'settling'::public.room_status)
    OR pool_id IS NOT NULL
  );

-- 4) Update trigger condition to reflect new statuses
DROP TRIGGER IF EXISTS trg_rooms_after_live ON public.rooms;

CREATE TRIGGER trg_rooms_after_live
  AFTER UPDATE ON public.rooms
  FOR EACH ROW
  WHEN (
    (NEW.status = ANY (ARRAY['playing'::public.room_status, 'settling'::public.room_status]))
    AND (OLD.status IS DISTINCT FROM NEW.status)
  )
  EXECUTE FUNCTION game_finance.trg_rooms_after_live();

COMMIT;
