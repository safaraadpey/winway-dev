-- Phase 2 (room-actor game loop): per-room engine ownership lease.
-- A single engine replica claims a playing room and owns its draw clock.
-- Columns are inert until the room-loop role is enabled (Phase 3+).
BEGIN;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS engine_owner_id text,
  ADD COLUMN IF NOT EXISTS engine_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS engine_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS engine_loop_state text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS last_draw_processed_at timestamptz;

COMMENT ON COLUMN public.rooms.engine_owner_id IS
  'Engine replica id holding the room-loop lease (NULL = unowned).';
COMMENT ON COLUMN public.rooms.engine_lease_until IS
  'Lease expiry; a room is claimable when this is NULL or in the past.';
COMMENT ON COLUMN public.rooms.engine_claimed_at IS
  'When the current lease was first acquired.';
COMMENT ON COLUMN public.rooms.engine_loop_state IS
  'Coarse loop state: idle | owned | releasing (diagnostics only).';
COMMENT ON COLUMN public.rooms.last_draw_processed_at IS
  'Wall time of the most recent processed draw for this room.';

-- Discovery index: find playing rooms whose lease is free/expired and are due.
CREATE INDEX IF NOT EXISTS idx_rooms_engine_claimable
  ON public.rooms (engine_lease_until, next_draw_at)
  WHERE status = 'playing';

COMMIT;
