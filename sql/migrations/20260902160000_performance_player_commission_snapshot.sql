-- Player generated commission in performance snapshots (commissions_log per player_id).
-- Maps to UserAccountPage player: کانیات / کانیات کل.

BEGIN;

ALTER TABLE public.performance_daily_stats
  ADD COLUMN IF NOT EXISTS player_commission_amount numeric NOT NULL DEFAULT 0 CHECK (player_commission_amount >= 0),
  ADD COLUMN IF NOT EXISTS player_commission_base numeric NOT NULL DEFAULT 0 CHECK (player_commission_base >= 0);

ALTER TABLE public.performance_lifetime_stats
  ADD COLUMN IF NOT EXISTS player_commission_amount numeric NOT NULL DEFAULT 0 CHECK (player_commission_amount >= 0),
  ADD COLUMN IF NOT EXISTS player_commission_base numeric NOT NULL DEFAULT 0 CHECK (player_commission_base >= 0);

COMMENT ON COLUMN public.performance_daily_stats.player_commission_amount IS
  'Player role only: SUM(agent+super+admin) from commissions_log on this player''s tickets in the accounting window.';
COMMENT ON COLUMN public.performance_daily_stats.player_commission_base IS
  'Player role only: SUM(commission_base) from commissions_log on this player''s tickets in the accounting window.';

CREATE OR REPLACE FUNCTION public.fn_performance_apply_player_commission_daily(
  p_snapshot_date date,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_updated integer := 0;
  v_inserted integer := 0;
BEGIN
  WITH pc AS (
    SELECT
      c.player_id AS user_id,
      COALESCE(SUM(c.agent_amount + c.super_amount + c.admin_amount), 0) AS player_commission_amount,
      COALESCE(SUM(c.commission_base), 0) AS player_commission_base
    FROM public.commissions_log c
    WHERE c.status = 'settled'
      AND c.player_id IS NOT NULL
      AND c.created_at >= p_from
      AND c.created_at < p_to
    GROUP BY c.player_id
    HAVING COALESCE(SUM(c.commission_base), 0) > 0
        OR COALESCE(SUM(c.agent_amount + c.super_amount + c.admin_amount), 0) > 0
  )
  UPDATE public.performance_daily_stats p
     SET player_commission_amount = pc.player_commission_amount,
         player_commission_base = pc.player_commission_base,
         updated_at = now()
    FROM pc
   WHERE p.snapshot_date = p_snapshot_date
     AND p.role = 'player'
     AND p.user_id = pc.user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  WITH pc AS (
    SELECT
      c.player_id AS user_id,
      COALESCE(SUM(c.agent_amount + c.super_amount + c.admin_amount), 0) AS player_commission_amount,
      COALESCE(SUM(c.commission_base), 0) AS player_commission_base
    FROM public.commissions_log c
    WHERE c.status = 'settled'
      AND c.player_id IS NOT NULL
      AND c.created_at >= p_from
      AND c.created_at < p_to
    GROUP BY c.player_id
    HAVING COALESCE(SUM(c.commission_base), 0) > 0
        OR COALESCE(SUM(c.agent_amount + c.super_amount + c.admin_amount), 0) > 0
  )
  INSERT INTO public.performance_daily_stats (
    snapshot_date,
    user_id,
    role,
    cards_count,
    cards_amount,
    games_played,
    player_winnings,
    tournament_winnings,
    line_wins_count,
    full_wins_count,
    agent_amount,
    super_amount,
    admin_amount,
    direct_player_amount,
    ticket_commission_base,
    tournament_commission_base,
    guarantee_topup,
    gateway_deposits,
    crypto_deposits,
    panel_deposits,
    panel_withdrawals,
    approved_withdrawals,
    player_commission_amount,
    player_commission_base,
    updated_at
  )
  SELECT
    p_snapshot_date,
    pc.user_id,
    'player'::text,
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    pc.player_commission_amount,
    pc.player_commission_base,
    now()
  FROM pc
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.performance_daily_stats d
    WHERE d.snapshot_date = p_snapshot_date
      AND d.user_id = pc.user_id
      AND d.role = 'player'
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_updated + v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_performance_apply_player_commission_daily(date, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_performance_apply_player_commission_daily(date, timestamptz, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_performance_rebuild_lifetime_stats()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_through_date date;
  v_lifetime_row_count integer := 0;
BEGIN
  SELECT MAX(d.snapshot_date)
    INTO v_through_date
  FROM public.performance_daily_stats d;

  DELETE FROM public.performance_lifetime_stats;

  IF v_through_date IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.performance_lifetime_stats (
    user_id,
    role,
    currency,
    through_snapshot_date,
    cards_count,
    cards_amount,
    games_played,
    player_winnings,
    tournament_winnings,
    line_wins_count,
    full_wins_count,
    agent_amount,
    super_amount,
    admin_amount,
    direct_player_amount,
    ticket_commission_base,
    tournament_commission_base,
    guarantee_topup,
    gateway_deposits,
    crypto_deposits,
    panel_deposits,
    panel_withdrawals,
    approved_withdrawals,
    player_commission_amount,
    player_commission_base,
    updated_at
  )
  SELECT
    d.user_id,
    d.role,
    d.currency,
    v_through_date,
    SUM(d.cards_count)::bigint,
    SUM(d.cards_amount),
    SUM(d.games_played)::bigint,
    SUM(d.player_winnings),
    SUM(d.tournament_winnings),
    SUM(d.line_wins_count)::bigint,
    SUM(d.full_wins_count)::bigint,
    SUM(d.agent_amount),
    SUM(d.super_amount),
    SUM(d.admin_amount),
    SUM(d.direct_player_amount),
    SUM(d.ticket_commission_base),
    SUM(d.tournament_commission_base),
    SUM(d.guarantee_topup),
    SUM(d.gateway_deposits),
    SUM(d.crypto_deposits),
    SUM(d.panel_deposits),
    SUM(d.panel_withdrawals),
    SUM(d.approved_withdrawals),
    SUM(d.player_commission_amount),
    SUM(d.player_commission_base),
    now()
  FROM public.performance_daily_stats d
  GROUP BY d.user_id, d.role, d.currency;

  GET DIAGNOSTICS v_lifetime_row_count = ROW_COUNT;
  RETURN v_lifetime_row_count;
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_performance_snapshot_run(p_snapshot_date date DEFAULT NULL)
RETURNS TABLE(
  out_snapshot_date date,
  out_row_count integer,
  out_lifetime_row_count integer,
  out_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_snapshot_date date;
  v_from timestamptz;
  v_to timestamptz;
  v_adminzero_id uuid;
  v_row_count integer := 0;
  v_lifetime_row_count integer := 0;
BEGIN
  v_snapshot_date := COALESCE(p_snapshot_date, public.fn_performance_default_snapshot_date());

  SELECT w.window_from, w.window_to
    INTO v_from, v_to
  FROM public.fn_performance_accounting_window(v_snapshot_date) w;

  IF v_from IS NULL OR v_to IS NULL OR v_from >= v_to THEN
    RAISE EXCEPTION '[PerformanceSnapshot] invalid accounting window for %', v_snapshot_date;
  END IF;

  SELECT u.id
    INTO v_adminzero_id
  FROM public.users u
  WHERE u.username = 'adminzero'
    AND u.role = 'admin'
  LIMIT 1;

  INSERT INTO public.performance_snapshot_runs (
    snapshot_date, status, window_from, window_to, started_at, heartbeat_at
  ) VALUES (
    v_snapshot_date, 'running', v_from, v_to, now(), now()
  )
  ON CONFLICT (snapshot_date) DO UPDATE
    SET status = 'running',
        window_from = EXCLUDED.window_from,
        window_to = EXCLUDED.window_to,
        started_at = now(),
        finished_at = NULL,
        heartbeat_at = now(),
        row_count = 0,
        error_text = NULL;

  DELETE FROM public.performance_daily_stats
  WHERE snapshot_date = v_snapshot_date;

  WITH normal_rooms AS (
    SELECT r.id
    FROM public.rooms r
    JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE rt.room_type = 'normal'
  ),
  tournament_rooms AS (
    SELECT r.id
    FROM public.rooms r
    JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE rt.room_type = 'tournament'
  ),
  player_cards AS (
    SELECT
      t.player_user_id AS user_id,
      COUNT(*)::bigint AS cards_count,
      COALESCE(SUM(rm.card_price), 0) AS cards_amount,
      COUNT(DISTINCT t.room_id)::bigint AS games_played
    FROM public.tickets t
    JOIN public.rooms rm ON rm.id = t.room_id
    WHERE t.created_at >= v_from
      AND t.created_at < v_to
      AND t.reservation_status IN ('confirmed', 'consumed')
      AND t.room_id IN (SELECT id FROM normal_rooms)
    GROUP BY t.player_user_id
  ),
  player_normal_wins AS (
    SELECT
      res.user_id,
      COALESCE(SUM(res.reward_amount), 0) AS player_winnings,
      COUNT(*) FILTER (WHERE res.win_type = 'line')::bigint AS line_wins_count,
      COUNT(*) FILTER (WHERE res.win_type = 'full')::bigint AS full_wins_count
    FROM public.results res
    WHERE res.created_at >= v_from
      AND res.created_at < v_to
      AND res.paid_at IS NOT NULL
      AND res.room_id IN (SELECT id FROM normal_rooms)
    GROUP BY res.user_id
  ),
  player_tournament_wins AS (
    SELECT
      res.user_id,
      COALESCE(SUM(res.reward_amount), 0) AS tournament_winnings
    FROM public.results res
    WHERE res.created_at >= v_from
      AND res.created_at < v_to
      AND res.paid_at IS NOT NULL
      AND res.room_id IN (SELECT id FROM tournament_rooms)
    GROUP BY res.user_id
  ),
  player_gateway AS (
    SELECT
      t.user_id,
      COALESCE(SUM(t.amount), 0) AS gateway_deposits
    FROM public.transactions t
    WHERE t.created_at >= v_from
      AND t.created_at < v_to
      AND t.user_id IS NOT NULL
      AND t.type = 'deposit'
      AND t.source_kind = 'deposit_domain'
    GROUP BY t.user_id
  ),
  player_crypto AS (
    SELECT
      t.user_id,
      COALESCE(SUM(t.amount), 0) AS crypto_deposits
    FROM public.transactions t
    WHERE t.created_at >= v_from
      AND t.created_at < v_to
      AND t.user_id IS NOT NULL
      AND t.type = 'deposit'
      AND t.source_kind = 'crypto_deposit'
    GROUP BY t.user_id
  ),
  player_manual_panel AS (
    SELECT
      t.source_ref::uuid AS user_id,
      COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'deposit'), 0) AS panel_deposits,
      COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'withdraw'), 0) AS panel_withdrawals
    FROM public.transactions t
    WHERE t.created_at >= v_from
      AND t.created_at < v_to
      AND t.source_kind = 'manual_panel'
      AND t.source_ref IS NOT NULL
      AND t.type IN ('deposit', 'withdraw')
    GROUP BY t.source_ref::uuid
  ),
  player_transfer_in AS (
    SELECT
      t.user_id,
      COALESCE(SUM(t.amount), 0) AS panel_deposits
    FROM public.transactions t
    WHERE t.created_at >= v_from
      AND t.created_at < v_to
      AND t.source_kind = 'admin_panel_transfer'
      AND t.type = 'transfer_in'
      AND COALESCE(t.meta->>'action', '') = 'deposit'
    GROUP BY t.user_id
  ),
  player_transfer_out AS (
    SELECT
      t.user_id,
      COALESCE(SUM(t.amount), 0) AS panel_withdrawals
    FROM public.transactions t
    WHERE t.created_at >= v_from
      AND t.created_at < v_to
      AND t.source_kind = 'admin_panel_transfer'
      AND t.type = 'transfer_out'
      AND COALESCE(t.meta->>'action', '') = 'withdraw'
    GROUP BY t.user_id
  ),
  player_withdrawals AS (
    SELECT
      wr.player_id AS user_id,
      COALESCE(SUM(wr.amount), 0) AS approved_withdrawals
    FROM public.withdrawal_requests wr
    WHERE wr.status = 'approved'
      AND COALESCE(wr.reviewed_at, wr.created_at) >= v_from
      AND COALESCE(wr.reviewed_at, wr.created_at) < v_to
    GROUP BY wr.player_id
  ),
  player_rows AS (
    SELECT
      u.id AS user_id,
      'player'::text AS role,
      COALESCE(pc.cards_count, 0) AS cards_count,
      COALESCE(pc.cards_amount, 0) AS cards_amount,
      COALESCE(pc.games_played, 0) AS games_played,
      COALESCE(pnw.player_winnings, 0) AS player_winnings,
      COALESCE(ptw.tournament_winnings, 0) AS tournament_winnings,
      COALESCE(pnw.line_wins_count, 0) AS line_wins_count,
      COALESCE(pnw.full_wins_count, 0) AS full_wins_count,
      0::numeric AS agent_amount,
      0::numeric AS super_amount,
      0::numeric AS admin_amount,
      0::numeric AS direct_player_amount,
      0::numeric AS ticket_commission_base,
      0::numeric AS tournament_commission_base,
      0::numeric AS guarantee_topup,
      COALESCE(pg.gateway_deposits, 0) AS gateway_deposits,
      COALESCE(pcr.crypto_deposits, 0) AS crypto_deposits,
      COALESCE(pmp.panel_deposits, 0) + COALESCE(pti.panel_deposits, 0) AS panel_deposits,
      COALESCE(pmp.panel_withdrawals, 0) + COALESCE(pto.panel_withdrawals, 0) AS panel_withdrawals,
      COALESCE(pw.approved_withdrawals, 0) AS approved_withdrawals
    FROM public.users u
    LEFT JOIN player_cards pc ON pc.user_id = u.id
    LEFT JOIN player_normal_wins pnw ON pnw.user_id = u.id
    LEFT JOIN player_tournament_wins ptw ON ptw.user_id = u.id
    LEFT JOIN player_gateway pg ON pg.user_id = u.id
    LEFT JOIN player_crypto pcr ON pcr.user_id = u.id
    LEFT JOIN player_manual_panel pmp ON pmp.user_id = u.id
    LEFT JOIN player_transfer_in pti ON pti.user_id = u.id
    LEFT JOIN player_transfer_out pto ON pto.user_id = u.id
    LEFT JOIN player_withdrawals pw ON pw.user_id = u.id
    WHERE u.role = 'player'::public.user_role
      AND (
        COALESCE(pc.cards_count, 0) > 0
        OR COALESCE(pc.cards_amount, 0) > 0
        OR COALESCE(pnw.player_winnings, 0) > 0
        OR COALESCE(ptw.tournament_winnings, 0) > 0
        OR COALESCE(pg.gateway_deposits, 0) > 0
        OR COALESCE(pcr.crypto_deposits, 0) > 0
        OR COALESCE(pmp.panel_deposits, 0) + COALESCE(pti.panel_deposits, 0) > 0
        OR COALESCE(pmp.panel_withdrawals, 0) + COALESCE(pto.panel_withdrawals, 0) > 0
        OR COALESCE(pw.approved_withdrawals, 0) > 0
      )
  ),
  agent_ticket AS (
    SELECT
      c.agent_id AS user_id,
      COALESCE(SUM(c.agent_amount), 0) AS agent_amount,
      COALESCE(SUM(c.commission_base), 0) AS ticket_commission_base
    FROM public.commissions_log c
    WHERE c.status = 'settled'
      AND c.agent_id IS NOT NULL
      AND c.agent_amount > 0
      AND c.created_at >= v_from
      AND c.created_at < v_to
    GROUP BY c.agent_id
  ),
  agent_tournament AS (
    SELECT
      s.agent_id AS user_id,
      COALESCE(SUM(s.agent_amount), 0) AS agent_amount,
      COALESCE(SUM(s.commission_base), 0) AS tournament_commission_base
    FROM public.tournament_commission_snapshots s
    WHERE s.agent_id IS NOT NULL
      AND s.agent_amount > 0
      AND s.created_at >= v_from
      AND s.created_at < v_to
      AND EXISTS (
        SELECT 1
        FROM public.tournament_commission_payouts p
        WHERE p.entry_id = s.entry_id
          AND p.status = 'paid'
          AND p.role = 'agent'
      )
    GROUP BY s.agent_id
  ),
  operator_manual_panel AS (
    SELECT
      t.source_ref::uuid AS user_id,
      COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'deposit'), 0) AS panel_deposits,
      COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'withdraw'), 0) AS panel_withdrawals
    FROM public.transactions t
    WHERE t.created_at >= v_from
      AND t.created_at < v_to
      AND t.source_kind = 'manual_panel'
      AND t.source_ref IS NOT NULL
      AND t.type IN ('deposit', 'withdraw')
    GROUP BY t.source_ref::uuid
  ),
  operator_transfer AS (
    SELECT
      (t.meta->>'actor_id')::uuid AS user_id,
      COALESCE(SUM(t.amount) FILTER (WHERE COALESCE(t.meta->>'action', '') = 'deposit'), 0) AS panel_deposits,
      COALESCE(SUM(t.amount) FILTER (WHERE COALESCE(t.meta->>'action', '') = 'withdraw'), 0) AS panel_withdrawals
    FROM public.transactions t
    WHERE t.created_at >= v_from
      AND t.created_at < v_to
      AND t.source_kind = 'admin_panel_transfer'
      AND t.type = 'transfer_out'
      AND t.meta->>'actor_id' IS NOT NULL
    GROUP BY (t.meta->>'actor_id')::uuid
  ),
  agent_rows AS (
    SELECT
      u.id AS user_id,
      'agent'::text AS role,
      0::bigint AS cards_count,
      0::numeric AS cards_amount,
      0::bigint AS games_played,
      0::numeric AS player_winnings,
      0::numeric AS tournament_winnings,
      0::bigint AS line_wins_count,
      0::bigint AS full_wins_count,
      COALESCE(at.agent_amount, 0) + COALESCE(atr.agent_amount, 0) AS agent_amount,
      0::numeric AS super_amount,
      0::numeric AS admin_amount,
      0::numeric AS direct_player_amount,
      COALESCE(at.ticket_commission_base, 0) AS ticket_commission_base,
      COALESCE(atr.tournament_commission_base, 0) AS tournament_commission_base,
      0::numeric AS guarantee_topup,
      0::numeric AS gateway_deposits,
      0::numeric AS crypto_deposits,
      COALESCE(omp.panel_deposits, 0) + COALESCE(ot.panel_deposits, 0) AS panel_deposits,
      COALESCE(omp.panel_withdrawals, 0) + COALESCE(ot.panel_withdrawals, 0) AS panel_withdrawals,
      0::numeric AS approved_withdrawals
    FROM public.users u
    LEFT JOIN agent_ticket at ON at.user_id = u.id
    LEFT JOIN agent_tournament atr ON atr.user_id = u.id
    LEFT JOIN operator_manual_panel omp ON omp.user_id = u.id
    LEFT JOIN operator_transfer ot ON ot.user_id = u.id
    WHERE u.role = 'agent'::public.user_role
      AND (
        COALESCE(at.agent_amount, 0) + COALESCE(atr.agent_amount, 0) > 0
        OR COALESCE(at.ticket_commission_base, 0) > 0
        OR COALESCE(atr.tournament_commission_base, 0) > 0
        OR COALESCE(omp.panel_deposits, 0) + COALESCE(ot.panel_deposits, 0) > 0
        OR COALESCE(omp.panel_withdrawals, 0) + COALESCE(ot.panel_withdrawals, 0) > 0
      )
  ),
  super_ticket AS (
    SELECT
      c.super_id AS user_id,
      COALESCE(SUM(c.super_amount), 0) AS super_amount,
      COALESCE(SUM(c.commission_base), 0) AS ticket_commission_base
    FROM public.commissions_log c
    WHERE c.status = 'settled'
      AND c.super_id IS NOT NULL
      AND c.super_amount > 0
      AND c.created_at >= v_from
      AND c.created_at < v_to
    GROUP BY c.super_id
  ),
  super_tournament AS (
    SELECT
      s.super_id AS user_id,
      COALESCE(SUM(s.super_amount), 0) AS super_amount,
      COALESCE(SUM(s.commission_base), 0) AS tournament_commission_base
    FROM public.tournament_commission_snapshots s
    WHERE s.super_id IS NOT NULL
      AND s.super_amount > 0
      AND s.created_at >= v_from
      AND s.created_at < v_to
      AND EXISTS (
        SELECT 1
        FROM public.tournament_commission_payouts p
        WHERE p.entry_id = s.entry_id
          AND p.status = 'paid'
          AND p.role = 'super'
      )
    GROUP BY s.super_id
  ),
  super_rows AS (
    SELECT
      u.id AS user_id,
      'super'::text AS role,
      0::bigint AS cards_count,
      0::numeric AS cards_amount,
      0::bigint AS games_played,
      0::numeric AS player_winnings,
      0::numeric AS tournament_winnings,
      0::bigint AS line_wins_count,
      0::bigint AS full_wins_count,
      0::numeric AS agent_amount,
      COALESCE(st.super_amount, 0) + COALESCE(str.super_amount, 0) AS super_amount,
      0::numeric AS admin_amount,
      0::numeric AS direct_player_amount,
      COALESCE(st.ticket_commission_base, 0) AS ticket_commission_base,
      COALESCE(str.tournament_commission_base, 0) AS tournament_commission_base,
      0::numeric AS guarantee_topup,
      0::numeric AS gateway_deposits,
      0::numeric AS crypto_deposits,
      COALESCE(omp.panel_deposits, 0) + COALESCE(ot.panel_deposits, 0) AS panel_deposits,
      COALESCE(omp.panel_withdrawals, 0) + COALESCE(ot.panel_withdrawals, 0) AS panel_withdrawals,
      0::numeric AS approved_withdrawals
    FROM public.users u
    LEFT JOIN super_ticket st ON st.user_id = u.id
    LEFT JOIN super_tournament str ON str.user_id = u.id
    LEFT JOIN operator_manual_panel omp ON omp.user_id = u.id
    LEFT JOIN operator_transfer ot ON ot.user_id = u.id
    WHERE u.role = 'super'::public.user_role
      AND (
        COALESCE(st.super_amount, 0) + COALESCE(str.super_amount, 0) > 0
        OR COALESCE(st.ticket_commission_base, 0) > 0
        OR COALESCE(str.tournament_commission_base, 0) > 0
        OR COALESCE(omp.panel_deposits, 0) + COALESCE(ot.panel_deposits, 0) > 0
        OR COALESCE(omp.panel_withdrawals, 0) + COALESCE(ot.panel_withdrawals, 0) > 0
      )
  ),
  admin_fee_ticket AS (
    SELECT COALESCE(SUM(t.amount), 0) AS admin_amount
    FROM public.transactions t
    WHERE v_adminzero_id IS NOT NULL
      AND t.user_id = v_adminzero_id
      AND t.type = 'fee_admin'
      AND t.source_kind = 'ticket_commission'
      AND t.created_at >= v_from
      AND t.created_at < v_to
  ),
  admin_fee_tournament AS (
    SELECT COALESCE(SUM(s.admin_amount), 0) AS admin_amount
    FROM public.tournament_commission_snapshots s
    WHERE (v_adminzero_id IS NULL OR s.admin_id = v_adminzero_id OR s.admin_id IS NULL)
      AND s.created_at >= v_from
      AND s.created_at < v_to
  ),
  admin_base_ticket AS (
    SELECT COALESCE(SUM(c.commission_base), 0) AS ticket_commission_base
    FROM public.commissions_log c
    WHERE c.status = 'settled'
      AND c.created_at >= v_from
      AND c.created_at < v_to
  ),
  admin_base_tournament AS (
    SELECT COALESCE(SUM(s.commission_base), 0) AS tournament_commission_base
    FROM public.tournament_commission_snapshots s
    WHERE (v_adminzero_id IS NULL OR s.admin_id = v_adminzero_id OR s.admin_id IS NULL)
      AND s.created_at >= v_from
      AND s.created_at < v_to
  ),
  admin_direct_ticket AS (
    SELECT COALESCE(SUM(c.admin_amount), 0) AS direct_player_amount
    FROM public.commissions_log c
    WHERE c.status = 'settled'
      AND c.agent_id IS NULL
      AND c.super_id IS NULL
      AND c.created_at >= v_from
      AND c.created_at < v_to
  ),
  admin_direct_tournament AS (
    SELECT COALESCE(SUM(s.admin_amount), 0) AS direct_player_amount
    FROM public.tournament_commission_snapshots s
    WHERE (v_adminzero_id IS NULL OR s.admin_id = v_adminzero_id OR s.admin_id IS NULL)
      AND s.agent_id IS NULL
      AND s.super_id IS NULL
      AND s.created_at >= v_from
      AND s.created_at < v_to
  ),
  admin_guarantee AS (
    SELECT COALESCE(SUM(greatest(p.prize_amount - COALESCE(po.pool_amount, 0), 0)), 0) AS guarantee_topup
    FROM (
      SELECT t.source_ref AS tournament_id, COALESCE(SUM(t.amount), 0) AS prize_amount
      FROM public.transactions t
      WHERE t.source_kind = 'tournament_prize'
        AND t.type = 'win'
        AND t.created_at >= v_from
        AND t.created_at < v_to
      GROUP BY t.source_ref
    ) p
    LEFT JOIN (
      SELECT s.tournament_id::text AS tournament_id, COALESCE(SUM(s.amount_to_pool), 0) AS pool_amount
      FROM public.tournament_commission_snapshots s
      GROUP BY s.tournament_id::text
    ) po ON po.tournament_id = p.tournament_id
  ),
  admin_panel AS (
    SELECT
      COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'deposit'), 0) AS panel_deposits,
      COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'withdraw'), 0) AS panel_withdrawals
    FROM public.transactions t
    WHERE v_adminzero_id IS NOT NULL
      AND t.source_ref = v_adminzero_id::text
      AND t.source_kind = 'manual_panel'
      AND t.created_at >= v_from
      AND t.created_at < v_to
      AND t.type IN ('deposit', 'withdraw')
  ),
  admin_transfer AS (
    SELECT
      COALESCE(SUM(t.amount) FILTER (WHERE COALESCE(t.meta->>'action', '') = 'deposit'), 0) AS panel_deposits,
      COALESCE(SUM(t.amount) FILTER (WHERE COALESCE(t.meta->>'action', '') = 'withdraw'), 0) AS panel_withdrawals
    FROM public.transactions t
    WHERE v_adminzero_id IS NOT NULL
      AND t.source_kind = 'admin_panel_transfer'
      AND t.type = 'transfer_out'
      AND (t.meta->>'actor_id')::uuid = v_adminzero_id
      AND t.created_at >= v_from
      AND t.created_at < v_to
  ),
  admin_gateway AS (
    SELECT COALESCE(SUM(t.amount), 0) AS gateway_deposits
    FROM public.transactions t
    WHERE v_adminzero_id IS NOT NULL
      AND t.user_id = v_adminzero_id
      AND t.type = 'deposit'
      AND t.source_kind = 'deposit_domain'
      AND t.created_at >= v_from
      AND t.created_at < v_to
  ),
  admin_row AS (
    SELECT
      v_adminzero_id AS user_id,
      'admin'::text AS role,
      0::bigint AS cards_count,
      0::numeric AS cards_amount,
      0::bigint AS games_played,
      0::numeric AS player_winnings,
      0::numeric AS tournament_winnings,
      0::bigint AS line_wins_count,
      0::bigint AS full_wins_count,
      0::numeric AS agent_amount,
      0::numeric AS super_amount,
      COALESCE(af.admin_amount, 0) + COALESCE(aft.admin_amount, 0) AS admin_amount,
      COALESCE(adt.direct_player_amount, 0) + COALESCE(adr.direct_player_amount, 0) AS direct_player_amount,
      COALESCE(abt.ticket_commission_base, 0) AS ticket_commission_base,
      COALESCE(abtr.tournament_commission_base, 0) AS tournament_commission_base,
      COALESCE(ag.guarantee_topup, 0) AS guarantee_topup,
      COALESCE(agw.gateway_deposits, 0) AS gateway_deposits,
      0::numeric AS crypto_deposits,
      COALESCE(ap.panel_deposits, 0) + COALESCE(atr.panel_deposits, 0) AS panel_deposits,
      COALESCE(ap.panel_withdrawals, 0) + COALESCE(atr.panel_withdrawals, 0) AS panel_withdrawals,
      0::numeric AS approved_withdrawals
    FROM admin_fee_ticket af
    CROSS JOIN admin_fee_tournament aft
    CROSS JOIN admin_base_ticket abt
    CROSS JOIN admin_base_tournament abtr
    CROSS JOIN admin_direct_ticket adt
    CROSS JOIN admin_direct_tournament adr
    CROSS JOIN admin_guarantee ag
    CROSS JOIN admin_panel ap
    CROSS JOIN admin_transfer atr
    CROSS JOIN admin_gateway agw
    WHERE v_adminzero_id IS NOT NULL
      AND (
        COALESCE(af.admin_amount, 0) + COALESCE(aft.admin_amount, 0) > 0
        OR COALESCE(abt.ticket_commission_base, 0) > 0
        OR COALESCE(abtr.tournament_commission_base, 0) > 0
        OR COALESCE(adt.direct_player_amount, 0) + COALESCE(adr.direct_player_amount, 0) > 0
        OR COALESCE(ag.guarantee_topup, 0) > 0
        OR COALESCE(agw.gateway_deposits, 0) > 0
        OR COALESCE(ap.panel_deposits, 0) + COALESCE(atr.panel_deposits, 0) > 0
        OR COALESCE(ap.panel_withdrawals, 0) + COALESCE(atr.panel_withdrawals, 0) > 0
      )
  ),
  all_rows AS (
    SELECT * FROM player_rows
    UNION ALL
    SELECT * FROM agent_rows
    UNION ALL
    SELECT * FROM super_rows
    UNION ALL
    SELECT * FROM admin_row
  )
  INSERT INTO public.performance_daily_stats (
    snapshot_date,
    user_id,
    role,
    cards_count,
    cards_amount,
    games_played,
    player_winnings,
    tournament_winnings,
    line_wins_count,
    full_wins_count,
    agent_amount,
    super_amount,
    admin_amount,
    direct_player_amount,
    ticket_commission_base,
    tournament_commission_base,
    guarantee_topup,
    gateway_deposits,
    crypto_deposits,
    panel_deposits,
    panel_withdrawals,
    approved_withdrawals,
    updated_at
  )
  SELECT
    v_snapshot_date,
    ar.user_id,
    ar.role,
    ar.cards_count,
    ar.cards_amount,
    ar.games_played,
    ar.player_winnings,
    ar.tournament_winnings,
    ar.line_wins_count,
    ar.full_wins_count,
    ar.agent_amount,
    ar.super_amount,
    ar.admin_amount,
    ar.direct_player_amount,
    ar.ticket_commission_base,
    ar.tournament_commission_base,
    ar.guarantee_topup,
    ar.gateway_deposits,
    ar.crypto_deposits,
    ar.panel_deposits,
    ar.panel_withdrawals,
    ar.approved_withdrawals,
    now()
  FROM all_rows ar
  WHERE ar.user_id IS NOT NULL;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  PERFORM public.fn_performance_apply_player_commission_daily(v_snapshot_date, v_from, v_to);

  v_lifetime_row_count := public.fn_performance_rebuild_lifetime_stats();

  UPDATE public.performance_snapshot_runs
     SET status = 'succeeded',
         finished_at = now(),
         heartbeat_at = now(),
         row_count = v_row_count,
         error_text = NULL
   WHERE snapshot_date = v_snapshot_date;

  RETURN QUERY
  SELECT v_snapshot_date, v_row_count, v_lifetime_row_count, 'succeeded'::text;

EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.performance_snapshot_runs
       SET status = 'failed',
           finished_at = now(),
           heartbeat_at = now(),
           error_text = SQLERRM
     WHERE snapshot_date = v_snapshot_date;
    RAISE;
END;
$$;


REVOKE ALL ON FUNCTION public.fn_performance_rebuild_lifetime_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_performance_rebuild_lifetime_stats() TO service_role;

REVOKE ALL ON FUNCTION public.fn_performance_snapshot_run(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_performance_snapshot_run(date) TO service_role;

COMMIT;
