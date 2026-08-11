-- NOTIFY on draw_jobs enqueue (optional LISTEN consumers; engine uses Realtime + in-process wake).
BEGIN;

CREATE OR REPLACE FUNCTION game_core.trg_after_draw_enqueue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.draw_jobs (
      room_id,
      draw_number,
      status,
      attempts,
      created_at,
      updated_at
  )
  VALUES (
      NEW.room_id,
      NEW.number,
      'queued',
      0,
      now(),
      now()
  )
  ON CONFLICT (room_id, draw_number) DO NOTHING;

  PERFORM pg_notify('draw_job_enqueued', NEW.room_id::text);

  RETURN NEW;
END;
$$;

COMMIT;
