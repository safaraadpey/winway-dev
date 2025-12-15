-- Migration: enforce single line/full win per ticket and delegate game_core fn
-- Date: 2025-12-08

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_results_ticket_win_type
  ON public.results (ticket_id, win_type);

CREATE OR REPLACE FUNCTION public.fn_evaluate_room_after_draw(
  p_room_id uuid,
  p_draw_number integer
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_full_winner_count integer;
BEGIN
  WITH ticket_analysis AS (
    SELECT 
      t.id AS ticket_id,
      t.player_user_id AS user_id,
      COUNT(DISTINCT cn.value) AS total_cells,
      COUNT(DISTINCT CASE WHEN m.value IS NOT NULL THEN cn.value END) AS marked_cells,
      COUNT(DISTINCT CASE WHEN cn.row_no = 1 AND m.value IS NOT NULL THEN cn.value END) AS row1_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 2 AND m.value IS NOT NULL THEN cn.value END) AS row2_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 3 AND m.value IS NOT NULL THEN cn.value END) AS row3_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 1 THEN cn.value END) AS row1_total,
      COUNT(DISTINCT CASE WHEN cn.row_no = 2 THEN cn.value END) AS row2_total,
      COUNT(DISTINCT CASE WHEN cn.row_no = 3 THEN cn.value END) AS row3_total
    FROM tickets t
    INNER JOIN card_numbers cn ON cn.pool_card_id = t.pool_card_id
    LEFT JOIN marks m ON m.ticket_id = t.id AND m.value = cn.value
    WHERE t.room_id = p_room_id
      AND t.reservation_status IN ('reserved','confirmed','consumed')
    GROUP BY t.id, t.player_user_id
  ),
  line_candidates AS (
    SELECT ticket_id, user_id
    FROM ticket_analysis ta
    WHERE (
      ta.row1_marked = ta.row1_total OR
      ta.row2_marked = ta.row2_total OR
      ta.row3_marked = ta.row3_total
    )
    AND NOT EXISTS (
      SELECT 1 FROM results r
      WHERE r.ticket_id = ta.ticket_id
        AND r.win_type = 'line'
    )
  ),
  full_candidates AS (
    SELECT ticket_id, user_id
    FROM ticket_analysis ta
    WHERE ta.marked_cells = ta.total_cells
      AND NOT EXISTS (
        SELECT 1 FROM results r
        WHERE r.ticket_id = ta.ticket_id
          AND r.win_type = 'full'
      )
  ),
  winners AS (
    SELECT ticket_id, user_id, 'line'::text AS win_type
    FROM line_candidates
    UNION ALL
    SELECT ticket_id, user_id, 'full'::text AS win_type
    FROM full_candidates
  )
  INSERT INTO results (room_id, user_id, ticket_id, win_type, reward_amount, draw_number)
  SELECT 
    p_room_id,
    user_id,
    ticket_id,
    win_type,
    0,
    p_draw_number
  FROM winners
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*)
    INTO v_full_winner_count
  FROM results
  WHERE room_id = p_room_id
    AND win_type = 'full'
    AND draw_number = p_draw_number;

  IF v_full_winner_count > 0 THEN
    UPDATE rooms
       SET status = 'settling'::room_status,
           updated_at = NOW()
     WHERE id = p_room_id
       AND status <> 'finished'::room_status
       AND status <> 'settling'::room_status;

    PERFORM game_finance.fn_finish_room_and_settle(p_room_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION game_core.fn_evaluate_room_after_draw(
  p_room uuid,
  p_draw integer
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.fn_evaluate_room_after_draw(p_room, p_draw);
END;
$$;

COMMIT;
