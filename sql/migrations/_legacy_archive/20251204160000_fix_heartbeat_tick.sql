-- Migration: Fix fn_heartbeat_tick to call new signature explicitly
-- Date: 2025-12-04

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_heartbeat_tick()
RETURNS void
LANGUAGE plpgsql
AS $function$
begin
  -- مدیریت روم‌های در حالت waiting → live/playing
  perform game_core.fn_manage_waiting_rooms(50, false);

  -- مدیریت روم‌های در حال بازی / تولید draw و job
  perform game_core.fn_manage_room_live_actions();
end;
$function$;

ALTER FUNCTION public.fn_heartbeat_tick() OWNER TO postgres;

COMMIT;
