-- Migration: add diagnostic logs for commission pipeline
-- Date: 2025-12-02

BEGIN;

CREATE OR REPLACE FUNCTION game_finance.fn_record_ticket_commission(p_ticket uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_room uuid;
  v_player uuid;
  v_price numeric;
  v_rate_room numeric := 0;
  v_total_comm numeric := 0;
  v_agent uuid;
  v_super uuid;
  v_agent_rate numeric := 0;
  v_super_rate numeric := 0;
  v_agent_amount numeric := 0;
  v_super_amount numeric := 0;
  v_admin_amount numeric := 0;
  v_id uuid;
BEGIN
  RAISE LOG 'fn_record_ticket_commission ticket=%', p_ticket;

  SELECT id INTO v_id FROM public.commissions_log WHERE ticket_id = p_ticket;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT t.room_id, t.player_user_id, t.price
    INTO v_room, v_player, v_price
  FROM public.tickets t
  WHERE t.id = p_ticket
    AND t.reservation_status = 'consumed'::reservation_status;

  IF v_room IS NULL OR v_price IS NULL THEN
    RAISE EXCEPTION 'ticket % not found or not consumed', p_ticket;
  END IF;

  SELECT COALESCE(r.commission_rate, rt.commission_rate, 0)
    INTO v_rate_room
  FROM public.rooms r
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = v_room;

  IF v_rate_room > 1 THEN
    v_rate_room := v_rate_room / 100;
  END IF;

  SELECT pa.agent_id, pa.super_id
    INTO v_agent, v_super
  FROM public.player_affiliation pa
  WHERE pa.user_id = v_player;
  RAISE LOG 'fn_record_ticket_commission room=% agent=% super=%', v_room, COALESCE(v_agent::text, 'NULL'), COALESCE(v_super::text, 'NULL');

  IF v_agent IS NOT NULL THEN
    SELECT COALESCE(uc.agent_commission,0) INTO v_agent_rate
    FROM public.user_commissions uc WHERE uc.user_id = v_agent;
    IF v_agent_rate > 1 THEN
      v_agent_rate := v_agent_rate / 100;
    END IF;
  END IF;

  IF v_super IS NOT NULL THEN
    SELECT COALESCE(uc.super_commission,0) INTO v_super_rate
    FROM public.user_commissions uc WHERE uc.user_id = v_super;
    IF v_super_rate > 1 THEN
      v_super_rate := v_super_rate / 100;
    END IF;
  END IF;

  v_total_comm   := CEIL(v_price * v_rate_room);
  v_agent_amount := CEIL(v_total_comm * v_agent_rate);
  v_super_amount := CEIL(v_total_comm * v_super_rate);
  v_admin_amount := GREATEST(v_total_comm - v_agent_amount - v_super_amount, 0);

  INSERT INTO public.commissions_log(
    ticket_id, room_id, player_id,
    gross_amount, commission_rate, commission_base,
    agent_id, super_id,
    agent_rate, super_rate,
    agent_amount, super_amount, admin_amount
  ) VALUES (
    p_ticket, v_room, v_player,
    v_price, v_rate_room, v_total_comm,
    v_agent, v_super,
    COALESCE(v_agent_rate,0), COALESCE(v_super_rate,0),
    v_agent_amount, v_super_amount, v_admin_amount
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

ALTER FUNCTION game_finance.fn_record_ticket_commission(p_ticket uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION game_finance.trg_tickets_after_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.reservation_status = 'consumed'::reservation_status
     AND (OLD.reservation_status IS DISTINCT FROM 'consumed'::reservation_status) THEN

    RAISE LOG 'trg_tickets_after_paid ticket=%', NEW.id;
    PERFORM game_finance.fn_distribute_ticket_commission(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION game_finance.trg_tickets_after_paid() OWNER TO postgres;

COMMIT;


