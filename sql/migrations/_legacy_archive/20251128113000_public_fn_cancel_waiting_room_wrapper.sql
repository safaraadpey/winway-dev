-- Migration: public wrapper for fn_cancel_waiting_room
-- تاریخ: 2025-11-28
--
-- هدف: فراهم کردن دسترسی RPC از طریق schema public به تابع core.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_cancel_waiting_room(
  p_room uuid,
  p_by_admin boolean DEFAULT false,
  p_user uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN game_core.fn_cancel_waiting_rooms(p_room, p_by_admin, p_user);
END;
$function$;

COMMIT;


