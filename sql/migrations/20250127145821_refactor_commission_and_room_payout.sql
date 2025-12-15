-- Migration: Refactor fn_distribute_ticket_commission و fn_payout_room_if_full
-- تاریخ: 2025-01-27
-- توضیحات: تبدیل این دو تابع برای استفاده از game_finance.fn_wallet_apply_delta
--           تمام write operations روی wallets و transactions از طریق هسته مالی انجام می‌شود

BEGIN;

-- ============================================================================
-- 1. Refactor fn_distribute_ticket_commission
-- ============================================================================
-- این تابع دیگر مستقیماً wallets و transactions را نمی‌نویسد.
-- به‌جای آن، برای هر نقش (agent, super, admin) یک بار
-- game_finance.fn_wallet_apply_delta را فراخوانی می‌کند.
-- ============================================================================

CREATE OR REPLACE FUNCTION game_finance.fn_distribute_ticket_commission(
  p_ticket uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  c record;
  v_currency text;
  v_admin_user uuid;
  v_rollup_amount numeric := 0;
  v_transaction_id uuid;
BEGIN
  -- 1. خواندن commissions_log (یا ایجاد با fn_record_ticket_commission)
  SELECT *
    INTO c
  FROM public.commissions_log
  WHERE ticket_id = p_ticket;

  IF NOT FOUND THEN
    -- تلاش برای ثبت، اگر نبود
    PERFORM game_finance.fn_record_ticket_commission(p_ticket);
    SELECT * INTO c FROM public.commissions_log WHERE ticket_id = p_ticket;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'commission log not found for ticket %', p_ticket;
    END IF;
  END IF;

  -- 2. Idempotency check
  IF c.distributed_at IS NOT NULL THEN
    RETURN;
  END IF;

  -- 3. خواندن currency و admin_user
  SELECT currency INTO v_currency
  FROM public.rooms
  WHERE id = c.room_id;

  SELECT u.id INTO v_admin_user
  FROM public.users u
  WHERE u.role = 'admin'
  LIMIT 1;

  -- 4. توزیع به Agent
  IF c.agent_user_id IS NOT NULL AND c.agent_amount > 0 THEN
    BEGIN
      SELECT game_finance.fn_wallet_apply_delta(
        p_user_id := c.agent_user_id,
        p_currency := v_currency,
        p_amount_delta := c.agent_amount,
        p_transaction_type := 'fee_agent',
        p_source_kind := 'ticket_commission',
        p_source_ref := NULL,
        p_description := 'ticket commission (agent)',
        p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
        p_allow_negative := false
      ) INTO v_transaction_id;
    EXCEPTION
      WHEN OTHERS THEN
        -- اگر wallet وجود نداشته باشد یا خطا بدهد → rollup
        v_rollup_amount := v_rollup_amount + c.agent_amount;
    END;
  END IF;

  -- 5. توزیع به Super
  IF c.super_user_id IS NOT NULL AND c.super_amount > 0 THEN
    BEGIN
      SELECT game_finance.fn_wallet_apply_delta(
        p_user_id := c.super_user_id,
        p_currency := v_currency,
        p_amount_delta := c.super_amount,
        p_transaction_type := 'fee_super',
        p_source_kind := 'ticket_commission',
        p_source_ref := NULL,
        p_description := 'ticket commission (super)',
        p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
        p_allow_negative := false
      ) INTO v_transaction_id;
    EXCEPTION
      WHEN OTHERS THEN
        -- اگر wallet وجود نداشته باشد یا خطا بدهد → rollup
        v_rollup_amount := v_rollup_amount + c.super_amount;
    END;
  END IF;

  -- 6. توزیع به Admin (باقیمانده + rollup)
  IF (c.admin_amount + v_rollup_amount) > 0 AND v_admin_user IS NOT NULL THEN
    SELECT game_finance.fn_wallet_apply_delta(
      p_user_id := v_admin_user,
      p_currency := v_currency,
      p_amount_delta := c.admin_amount + v_rollup_amount,
      p_transaction_type := 'fee_admin',
      p_source_kind := 'ticket_commission',
      p_source_ref := NULL,
      p_description := 'ticket commission (admin remainder)',
      p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
      p_allow_negative := false
    ) INTO v_transaction_id;
  END IF;

  -- 7. به‌روزرسانی commissions_log
  UPDATE public.commissions_log
  SET distributed_at = now(),
      admin_amount = c.admin_amount + v_rollup_amount
  WHERE id = c.id;
END;
$function$;

-- ============================================================================
-- 2. Refactor fn_payout_room_if_full
-- ============================================================================
-- این تابع دیگر مستقیماً wallets و transactions را نمی‌نویسد.
-- به‌جای آن، برای هر برنده یک بار game_finance.fn_wallet_apply_delta
-- را فراخوانی می‌کند.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_payout_room_if_full(
  p_room_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_room record;
  v_winner record;
  v_currency text;
  v_line_reward numeric;
  v_full_reward numeric;
  v_reward_amount numeric;
  v_transaction_id uuid;
BEGIN
  -- 1. خواندن اطلاعات room
  SELECT currency, line_reward_percentage, full_reward_percentage, card_price
  INTO v_room
  FROM public.rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found: %', p_room_id;
  END IF;

  v_currency := v_room.currency;
  v_line_reward := v_room.card_price * (v_room.line_reward_percentage / 100.0);
  v_full_reward := v_room.card_price * (v_room.full_reward_percentage / 100.0);

  -- 2. خواندن برندگان از results (که قبلاً توسط fn_evaluate_room_after_draw ثبت شده‌اند)
  FOR v_winner IN
    SELECT player_user_id, win_type
    FROM public.results
    WHERE room_id = p_room_id
      AND win_type IN ('line', 'full')
      AND paid_at IS NULL  -- اگر قبلاً پرداخت نشده باشد
  LOOP
    -- 3. تعیین مبلغ جایزه بر اساس win_type
    IF v_winner.win_type = 'line' THEN
      v_reward_amount := v_line_reward;
    ELSIF v_winner.win_type = 'full' THEN
      v_reward_amount := v_full_reward;
    ELSE
      CONTINUE;  -- skip invalid win_type
    END IF;

    -- 4. فراخوانی هسته مالی
    SELECT game_finance.fn_wallet_apply_delta(
      p_user_id := v_winner.player_user_id,
      p_currency := v_currency,
      p_amount_delta := v_reward_amount,
      p_transaction_type := 'payout',  -- یا enum مخصوص اگر وجود داشته باشد
      p_source_kind := 'game_payout',
      p_source_ref := p_room_id::text,
      p_description := format('game payout: %s win', v_winner.win_type),
      p_meta := jsonb_build_object('room_id', p_room_id, 'win_type', v_winner.win_type),
      p_allow_negative := false
    ) INTO v_transaction_id;

    -- 5. علامت‌گذاری پرداخت شده
    UPDATE public.results
    SET paid_at = now()
    WHERE room_id = p_room_id
      AND player_user_id = v_winner.player_user_id
      AND win_type = v_winner.win_type;
  END LOOP;
END;
$function$;

COMMIT;

-- ============================================================================
-- مثال‌های تست (کامنت شده - برای تست دستی استفاده شود)
-- ============================================================================

-- مثال 1: توزیع کمیسیون بلیط
-- فرض: یک ticket با id مشخص وجود دارد که commissions_log برای آن ثبت شده است
-- SELECT game_finance.fn_distribute_ticket_commission('ticket-uuid-here');
-- 
-- بررسی نتایج:
-- 1. SELECT * FROM public.wallets WHERE user_id IN (agent_id, super_id, admin_id);
--    - موجودی agent/super/admin باید افزایش یافته باشد
-- 2. SELECT * FROM public.transactions WHERE ticket_id = 'ticket-uuid-here';
--    - باید سه تراکنش با type='fee_agent', 'fee_super', 'fee_admin' وجود داشته باشد
-- 3. SELECT * FROM public.commissions_log WHERE ticket_id = 'ticket-uuid-here';
--    - distributed_at باید set شده باشد

-- مثال 2: پرداخت جایزه اتاق
-- فرض: یک room با id مشخص وجود دارد که کامل شده و برندگان در results ثبت شده‌اند
-- SELECT public.fn_payout_room_if_full('room-uuid-here');
--
-- بررسی نتایج:
-- 1. SELECT * FROM public.wallets WHERE user_id IN (
--      SELECT player_user_id FROM public.results WHERE room_id = 'room-uuid-here'
--    );
--    - موجودی برندگان باید افزایش یافته باشد
-- 2. SELECT * FROM public.transactions WHERE room_id = 'room-uuid-here' AND type = 'payout';
--    - باید تراکنش‌های پرداخت برای هر برنده وجود داشته باشد
-- 3. SELECT * FROM public.results WHERE room_id = 'room-uuid-here';
--    - paid_at باید برای برندگان set شده باشد

-- مثال 3: سناریوی کامل - اتاق با یک برنده و کمیسیون
-- 1. یک ticket خریداری می‌شود → fn_record_ticket_commission صدا زده می‌شود
-- 2. کمیسیون توزیع می‌شود → fn_distribute_ticket_commission صدا زده می‌شود
-- 3. اتاق کامل می‌شود → fn_evaluate_room_after_draw صدا زده می‌شود
-- 4. جایزه پرداخت می‌شود → fn_payout_room_if_full صدا زده می‌شود
--
-- بررسی نهایی:
-- SELECT 
--   w.user_id,
--   w.balance,
--   COUNT(t.id) as transaction_count,
--   SUM(CASE WHEN t.type = 'fee_agent' THEN t.amount ELSE 0 END) as agent_commission,
--   SUM(CASE WHEN t.type = 'fee_super' THEN t.amount ELSE 0 END) as super_commission,
--   SUM(CASE WHEN t.type = 'fee_admin' THEN t.amount ELSE 0 END) as admin_commission,
--   SUM(CASE WHEN t.type = 'payout' THEN t.amount ELSE 0 END) as payout_amount
-- FROM public.wallets w
-- LEFT JOIN public.transactions t ON t.wallet_id = w.id
-- WHERE w.user_id IN (player_id, agent_id, super_id, admin_id)
-- GROUP BY w.user_id, w.balance;

