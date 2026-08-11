-- Rename bot_* database objects to dev_*
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bot_schedule_status') THEN
    ALTER TYPE public.bot_schedule_status RENAME TO dev_schedule_status;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.bot_player_configs') IS NOT NULL THEN
    ALTER TABLE public.bot_player_configs RENAME TO dev_player_configs;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.bot_room_schedules') IS NOT NULL THEN
    ALTER TABLE public.bot_room_schedules RENAME TO dev_room_schedules;
  END IF;
END $$;

ALTER INDEX IF EXISTS idx_bot_player_configs_enabled RENAME TO idx_dev_player_configs_enabled;
ALTER INDEX IF EXISTS idx_bot_room_schedules_status_time RENAME TO idx_dev_room_schedules_status_time;
ALTER INDEX IF EXISTS idx_bot_room_schedules_user RENAME TO idx_dev_room_schedules_user;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'update_bot_player_configs_updated_at'
  ) THEN
    ALTER FUNCTION public.update_bot_player_configs_updated_at()
      RENAME TO update_dev_player_configs_updated_at;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'trg_bot_player_configs_updated_at'
      AND c.relname = 'dev_player_configs'
  ) THEN
    ALTER TRIGGER trg_bot_player_configs_updated_at ON public.dev_player_configs
      RENAME TO trg_dev_player_configs_updated_at;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.fn_pick_bot_room_schedules(integer);

CREATE OR REPLACE FUNCTION public.fn_pick_dev_room_schedules(p_limit integer DEFAULT 10)
RETURNS SETOF public.dev_room_schedules
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job public.dev_room_schedules%rowtype;
BEGIN
  FOR job IN
    SELECT *
    FROM public.dev_room_schedules
    WHERE status = 'approved'::dev_schedule_status
      AND scheduled_at <= now()
    ORDER BY scheduled_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    UPDATE public.dev_room_schedules
    SET status = 'processing',
        updated_at = now()
    WHERE id = job.id;

    RETURN NEXT job;
  END LOOP;
END;
$$;

COMMENT ON TABLE public.dev_player_configs IS
  'Per-user dev-player behavior for Dev Panel: play windows, room price bounds, max tickets.';
COMMENT ON COLUMN public.dev_player_configs.is_enabled IS
  'When true, user is treated as an active dev player.';

GRANT ALL ON TABLE public.dev_player_configs TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.dev_room_schedules TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.fn_pick_dev_room_schedules(integer) TO anon, authenticated, service_role;

COMMIT;
