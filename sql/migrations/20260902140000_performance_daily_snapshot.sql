-- Daily performance snapshot (accounting day = 08:00 Asia/Tehran .. next 08:00).
-- Populated by Railway worker ~08:05 Tehran via fn_performance_snapshot_run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.performance_snapshot_runs (
  snapshot_date date PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  window_from timestamptz NOT NULL,
  window_to timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  error_text text
);

COMMENT ON TABLE public.performance_snapshot_runs IS
  'One run per accounting snapshot_date (08:00–08:00 Asia/Tehran window).';

CREATE TABLE IF NOT EXISTS public.performance_daily_stats (
  snapshot_date date NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('player', 'agent', 'super', 'admin')),
  currency text NOT NULL DEFAULT 'IRR',
  cards_count bigint NOT NULL DEFAULT 0 CHECK (cards_count >= 0),
  cards_amount numeric NOT NULL DEFAULT 0 CHECK (cards_amount >= 0),
  games_played bigint NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  player_winnings numeric NOT NULL DEFAULT 0 CHECK (player_winnings >= 0),
  tournament_winnings numeric NOT NULL DEFAULT 0 CHECK (tournament_winnings >= 0),
  line_wins_count bigint NOT NULL DEFAULT 0 CHECK (line_wins_count >= 0),
  full_wins_count bigint NOT NULL DEFAULT 0 CHECK (full_wins_count >= 0),
  agent_amount numeric NOT NULL DEFAULT 0 CHECK (agent_amount >= 0),
  super_amount numeric NOT NULL DEFAULT 0 CHECK (super_amount >= 0),
  admin_amount numeric NOT NULL DEFAULT 0 CHECK (admin_amount >= 0),
  direct_player_amount numeric NOT NULL DEFAULT 0 CHECK (direct_player_amount >= 0),
  ticket_commission_base numeric NOT NULL DEFAULT 0 CHECK (ticket_commission_base >= 0),
  tournament_commission_base numeric NOT NULL DEFAULT 0 CHECK (tournament_commission_base >= 0),
  guarantee_topup numeric NOT NULL DEFAULT 0 CHECK (guarantee_topup >= 0),
  gateway_deposits numeric NOT NULL DEFAULT 0 CHECK (gateway_deposits >= 0),
  crypto_deposits numeric NOT NULL DEFAULT 0 CHECK (crypto_deposits >= 0),
  panel_deposits numeric NOT NULL DEFAULT 0 CHECK (panel_deposits >= 0),
  panel_withdrawals numeric NOT NULL DEFAULT 0 CHECK (panel_withdrawals >= 0),
  approved_withdrawals numeric NOT NULL DEFAULT 0 CHECK (approved_withdrawals >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, user_id, role)
);

COMMENT ON TABLE public.performance_daily_stats IS
  'Base metrics per user/role per accounting day (08:00–08:00 Tehran). Derived dashboard fields are computed at read time.';

CREATE INDEX IF NOT EXISTS idx_performance_daily_stats_user_date
  ON public.performance_daily_stats (user_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_performance_daily_stats_date
  ON public.performance_daily_stats (snapshot_date DESC);

CREATE OR REPLACE FUNCTION public.fn_performance_accounting_window(p_snapshot_date date)
RETURNS TABLE(window_from timestamptz, window_to timestamptz)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (p_snapshot_date + time '08:00') AT TIME ZONE 'Asia/Tehran' AS window_from,
    ((p_snapshot_date + 1) + time '08:00') AT TIME ZONE 'Asia/Tehran' AS window_to;
$$;

CREATE OR REPLACE FUNCTION public.fn_performance_default_snapshot_date()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN ((now() AT TIME ZONE 'Asia/Tehran')::time >= time '08:00')
      THEN ((now() AT TIME ZONE 'Asia/Tehran')::date - 1)
    ELSE ((now() AT TIME ZONE 'Asia/Tehran')::date - 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.fn_performance_snapshot_run(p_snapshot_date date DEFAULT NULL)
RETURNS TABLE(out_snapshot_date date, out_row_count integer, out_status text)
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

  UPDATE public.performance_snapshot_runs
     SET status = 'succeeded',
         finished_at = now(),
         heartbeat_at = now(),
         row_count = v_row_count,
         error_text = NULL
   WHERE snapshot_date = v_snapshot_date;

  RETURN QUERY
  SELECT v_snapshot_date, v_row_count, 'succeeded'::text;

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

ALTER TABLE public.performance_snapshot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY performance_snapshot_runs_admin_read
  ON public.performance_snapshot_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'::public.user_role
    )
  );

CREATE POLICY performance_daily_stats_admin_read
  ON public.performance_daily_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'::public.user_role
    )
  );

CREATE POLICY performance_daily_stats_self_read
  ON public.performance_daily_stats
  FOR SELECT
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.performance_snapshot_runs FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.performance_daily_stats FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.performance_snapshot_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.performance_daily_stats TO service_role;
GRANT SELECT ON TABLE public.performance_daily_stats TO authenticated;

REVOKE ALL ON FUNCTION public.fn_performance_accounting_window(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_performance_default_snapshot_date() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_performance_snapshot_run(date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_performance_accounting_window(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_performance_default_snapshot_date() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_performance_snapshot_run(date) TO service_role;

COMMIT;
