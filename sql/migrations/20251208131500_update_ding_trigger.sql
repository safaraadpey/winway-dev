-- Migration: align ding distribution with reserved tickets
-- Date: 2025-12-08

BEGIN;

CREATE OR REPLACE FUNCTION public.distribute_ding_on_draw()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_room_id UUID;
  v_drawn_number INTEGER;
  v_ding_per_card NUMERIC;
  v_room_template_id UUID;
  v_ticket_record RECORD;
  v_total_ding NUMERIC;
BEGIN
  v_room_id := NEW.room_id;
  v_drawn_number := NEW.number;

  IF NOT EXISTS (
    SELECT 1 FROM rooms
    WHERE id = v_room_id
      AND status IN ('live', 'playing')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT
    r.ding_per_number,
    r.room_template_id
  INTO
    v_ding_per_card,
    v_room_template_id
  FROM rooms r
  WHERE r.id = v_room_id;

  IF v_ding_per_card IS NULL THEN
    SELECT COALESCE(rt.ding_per_number, 1)
    INTO v_ding_per_card
    FROM room_templates rt
    WHERE rt.id = v_room_template_id;

    IF v_ding_per_card IS NULL THEN
      v_ding_per_card := 1;
    END IF;
  END IF;

  FOR v_ticket_record IN
    SELECT DISTINCT
      t.id AS ticket_id,
      t.player_user_id,
      t.room_id
    FROM tickets t
    JOIN card_pool_cards cpc ON cpc.id = t.pool_card_id
    JOIN card_numbers cn ON cn.pool_card_id = cpc.id
    WHERE t.room_id = v_room_id
      AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
      AND cn.value = v_drawn_number
  LOOP
    v_total_ding := v_ding_per_card;

    PERFORM update_ding_balance(v_ticket_record.player_user_id, v_total_ding);

    INSERT INTO ding_transactions (
      user_id,
      room_id,
      ticket_id,
      draw_id,
      drawn_number,
      amount,
      description
    ) VALUES (
      v_ticket_record.player_user_id,
      v_room_id,
      v_ticket_record.ticket_id,
      NEW.id,
      v_drawn_number,
      v_total_ding,
      format('Ding برای عدد %s روی کارت (ضریب: %s)', v_drawn_number, v_ding_per_card)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

COMMIT;
