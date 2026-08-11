-- Migration: Fix draw job processing and settlement locking
-- Date: 2025-12-04

BEGIN;

CREATE OR REPLACE FUNCTION game_finance.fn_finish_room_and_settle(p_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_room record;
  v_now timestamptz := now();
  rec_ticket record;
  rec_comm record;
  rec_result record;
  v_total_pool numeric := 0;
  v_line_pct numeric;
  v_full_pct numeric;
  v_line_pool numeric := 0;
  v_full_pool numeric := 0;
  v_line_winners integer := 0;
  v_full_winners integer := 0;
  v_line_share numeric := 0;
  v_full_share numeric := 0;
  v_currency text;
BEGIN
  SELECT r.*,
         COALESCE(r.line_reward_percentage, rt.line_reward_percentage, 0.5) AS __line_pct,
         COALESCE(r.full_reward_percentage, rt.full_reward_percentage, 0.5) AS __full_pct
    INTO v_room
  FROM public.rooms r
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = p_room
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room % not found', p_room;
  END IF;

  IF v_room.status = 'finished' THEN
    RAISE NOTICE 'fn_finish_room_and_settle: room % already finished', p_room;
    RETURN;
  END IF;

  IF v_room.status <> 'settling' THEN
    RAISE EXCEPTION 'room % is not settling (status=%)', p_room, v_room.status;
  END IF;

  v_currency := v_room.currency;
  v_line_pct := GREATEST(COALESCE(v_room.__line_pct, 0), 0);
  v_full_pct := GREATEST(COALESCE(v_room.__full_pct, 0), 0);

  IF v_line_pct = 0 AND v_full_pct = 0 THEN
    v_line_pct := 0.5;
    v_full_pct := 0.5;
  END IF;

  IF (v_line_pct + v_full_pct) > 1 THEN
    v_line_pct := v_line_pct / (v_line_pct + v_full_pct);
    v_full_pct := 1 - v_line_pct;
  END IF;

  FOR rec_ticket IN
    WITH updated AS (
      UPDATE public.tickets
         SET reservation_status = 'consumed'::public.reservation_status,
             updated_at = v_now
       WHERE room_id = p_room
         AND reservation_status IN ('reserved','confirmed')
       RETURNING id, player_user_id, price
    )
    SELECT * FROM updated
  LOOP
    PERFORM game_finance.fn_wallet_capture_join(
      rec_ticket.player_user_id,
      rec_ticket.price,
      v_currency,
      p_room,
      rec_ticket.id
    );
  END LOOP;

  FOR rec_comm IN
    SELECT ticket_id
      FROM public.commissions_log
     WHERE room_id = p_room
       AND status = 'pending'
     FOR UPDATE
  LOOP
    v_total_pool := v_total_pool + COALESCE(game_finance.fn_distribute_ticket_commission(rec_comm.ticket_id), 0);
  END LOOP;

  v_line_pool := ROUND(v_total_pool * v_line_pct, 2);
  v_full_pool := ROUND(v_total_pool - v_line_pool, 2);

  SELECT COUNT(*)
    INTO v_line_winners
  FROM public.results
  WHERE room_id = p_room
    AND win_type = 'line'
    AND paid_at IS NULL;

  SELECT COUNT(*)
    INTO v_full_winners
  FROM public.results
  WHERE room_id = p_room
    AND win_type = 'full'
    AND paid_at IS NULL;

  IF v_line_winners = 0 THEN
    v_full_pool := v_full_pool + v_line_pool;
    v_line_pool := 0;
  END IF;

  IF v_line_winners > 0 THEN
    v_line_share := CASE WHEN v_line_pool > 0 THEN ROUND(v_line_pool / v_line_winners, 2) ELSE 0 END;

    FOR rec_result IN
      SELECT id, user_id, ticket_id
      FROM public.results
      WHERE room_id = p_room
        AND win_type = 'line'
        AND paid_at IS NULL
      FOR UPDATE
    LOOP
      IF v_line_share > 0 THEN
        PERFORM game_finance.fn_wallet_apply_delta(
          p_user_id := rec_result.user_id,
          p_currency := v_currency,
          p_amount_delta := v_line_share,
          p_transaction_type := 'win',
          p_source_kind := 'room_settlement',
          p_source_ref := p_room::text,
          p_description := 'room line prize payout',
          p_meta := jsonb_build_object('room_id', p_room, 'ticket_id', rec_result.ticket_id, 'win_type', 'line'),
          p_allow_negative := false
        );
      END IF;

      UPDATE public.results
         SET reward_amount = COALESCE(reward_amount, 0) + v_line_share,
             paid_at = v_now
       WHERE id = rec_result.id;
    END LOOP;
  END IF;

  IF v_full_winners > 0 THEN
    v_full_share := CASE WHEN v_full_pool > 0 THEN ROUND(v_full_pool / v_full_winners, 2) ELSE 0 END;

    FOR rec_result IN
      SELECT id, user_id, ticket_id
      FROM public.results
      WHERE room_id = p_room
        AND win_type = 'full'
        AND paid_at IS NULL
      FOR UPDATE
    LOOP
      IF v_full_share > 0 THEN
        PERFORM game_finance.fn_wallet_apply_delta(
          p_user_id := rec_result.user_id,
          p_currency := v_currency,
          p_amount_delta := v_full_share,
          p_transaction_type := 'win',
          p_source_kind := 'room_settlement',
          p_source_ref := p_room::text,
          p_description := 'room full prize payout',
          p_meta := jsonb_build_object('room_id', p_room, 'ticket_id', rec_result.ticket_id, 'win_type', 'full'),
          p_allow_negative := false
        );
      END IF;

      UPDATE public.results
         SET reward_amount = COALESCE(reward_amount, 0) + v_full_share,
             paid_at = v_now
       WHERE id = rec_result.id;
    END LOOP;
  END IF;

  UPDATE public.rooms
     SET status = 'finished',
         prize_paid_at = v_now,
         line_prize_pool = 0,
         full_prize_pool = 0,
         ends_at = COALESCE(ends_at, v_now),
         updated_at = v_now
   WHERE id = p_room;

  RAISE NOTICE 'room % settled: total_pool=%, line_winners=%, full_winners=%',
    p_room, v_total_pool, v_line_winners, v_full_winners;
END;
$function$;

ALTER FUNCTION game_finance.fn_finish_room_and_settle(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.fn_process_draw_jobs_batch()
RETURNS void
LANGUAGE plpgsql
AS $function$
declare
  job record;
begin
  -- 1) گرفتن batch از jobها
  for job in
    select *
    from game_core.rpc_pick_draw_jobs()
  loop
    begin
      -- 2) اعمال مارک‌ها
      perform public.rpc_apply_marks_for_draw(
        job.room_id,
        job.draw_number
      );

      -- 3) ارزیابی پس از قرعه
      perform public.fn_evaluate_room_after_draw(
        job.room_id,
        job.draw_number
      );

      -- 4) بستن job در صورت موفقیت
      update public.draw_jobs
      set status = 'done',
          updated_at = now()
      where id = job.id;
    exception
      when others then
        -- در صورت خطا: برگرداندن به صف با attempts + 1
        update public.draw_jobs
        set status   = 'queued',
            attempts = coalesce(job.attempts, 0) + 1,
            updated_at = now()
        where id = job.id;
    end;
  end loop;
end;
$function$;

ALTER FUNCTION public.fn_process_draw_jobs_batch() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.fn_process_draw_jobs_batch_worker(
  p_worker_id integer,
  p_total_workers integer
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT *
    FROM game_core.rpc_pick_draw_jobs(
      p_limit => 100,
      p_worker_id => p_worker_id,
      p_total_workers => p_total_workers
    )
  LOOP
    BEGIN
      PERFORM public.rpc_apply_marks_for_draw(
        job.room_id,
        job.draw_number
      );

      PERFORM public.fn_evaluate_room_after_draw(
        job.room_id,
        job.draw_number
      );

      UPDATE public.draw_jobs
      SET status = 'done',
          updated_at = now()
      WHERE id = job.id;
    EXCEPTION
      WHEN OTHERS THEN
        UPDATE public.draw_jobs
        SET status   = 'queued',
            attempts = COALESCE(job.attempts, 0) + 1,
            updated_at = now()
        WHERE id = job.id;
        
        RAISE WARNING 'Error processing job %: %', job.id, SQLERRM;
    END;
  END LOOP;
END;
$function$;

ALTER FUNCTION public.fn_process_draw_jobs_batch_worker(integer, integer) OWNER TO postgres;

COMMIT;
