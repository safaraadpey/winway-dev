-- Phase 2: actor-loop timing instrumentation on draws.
-- These columns let the room-actor path decompose its own latency, in parallel
-- with the existing drain/* and queue_wait columns used by the queue path.
BEGIN;

ALTER TABLE public.draws
  ADD COLUMN IF NOT EXISTS actor_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS actor_insert_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS actor_inserted_at timestamptz,
  ADD COLUMN IF NOT EXISTS actor_evaluate_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS actor_finalize_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS actor_next_scheduled_at timestamptz;

COMMENT ON COLUMN public.draws.actor_due_at IS
  'next_draw_at the actor woke for (scheduling accuracy = inserted - due).';
COMMENT ON COLUMN public.draws.actor_insert_started_at IS
  'When the actor began the owner-guarded insert RPC.';
COMMENT ON COLUMN public.draws.actor_inserted_at IS
  'When the owner-guarded insert committed.';
COMMENT ON COLUMN public.draws.actor_evaluate_started_at IS
  'When in-memory mark+evaluate began.';
COMMENT ON COLUMN public.draws.actor_finalize_started_at IS
  'When the finalize RPC began.';
COMMENT ON COLUMN public.draws.actor_next_scheduled_at IS
  'next_draw_at the actor set for the following ball.';

-- Recovery / ordering scan: oldest unprocessed draw per room, by insert time.
CREATE INDEX IF NOT EXISTS idx_draws_room_processed
  ON public.draws (room_id, created_at)
  WHERE processed_at IS NULL;

COMMIT;
