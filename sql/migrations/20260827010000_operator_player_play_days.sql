-- Unique downline players who played per agent/super per UTC day.
-- One row per (day, operator, role, player). Idempotent via PK + ON CONFLICT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.operator_player_play_days (
  stat_date date NOT NULL,
  operator_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  operator_role text NOT NULL CHECK (operator_role IN ('agent', 'super')),
  player_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stat_date, operator_id, operator_role, player_id)
);

COMMENT ON TABLE public.operator_player_play_days IS
  'Daily unique players who played under an agent or super (UTC calendar day).';

CREATE INDEX IF NOT EXISTS idx_operator_player_play_days_operator_date
  ON public.operator_player_play_days (operator_id, operator_role, stat_date DESC);

CREATE INDEX IF NOT EXISTS idx_operator_player_play_days_stat_date
  ON public.operator_player_play_days (stat_date DESC);

CREATE OR REPLACE FUNCTION game_core.fn_record_operator_player_play_day(
  p_player_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'game_core', 'public', 'pg_temp'
AS $$
DECLARE
  v_stat_date date;
  v_agent_id uuid;
  v_super_id uuid;
BEGIN
  IF p_player_id IS NULL THEN
    RETURN;
  END IF;

  v_stat_date := (COALESCE(p_at, now()) AT TIME ZONE 'UTC')::date;

  SELECT pa.agent_id, pa.super_id
    INTO v_agent_id, v_super_id
  FROM public.player_affiliation pa
  WHERE pa.user_id = p_player_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_agent_id IS NOT NULL THEN
    INSERT INTO public.operator_player_play_days (
      stat_date, operator_id, operator_role, player_id, first_seen_at
    ) VALUES (
      v_stat_date, v_agent_id, 'agent', p_player_id, COALESCE(p_at, now())
    )
    ON CONFLICT (stat_date, operator_id, operator_role, player_id) DO NOTHING;
  END IF;

  IF v_super_id IS NOT NULL THEN
    INSERT INTO public.operator_player_play_days (
      stat_date, operator_id, operator_role, player_id, first_seen_at
    ) VALUES (
      v_stat_date, v_super_id, 'super', p_player_id, COALESCE(p_at, now())
    )
    ON CONFLICT (stat_date, operator_id, operator_role, player_id) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION game_core.fn_trg_tickets_operator_play_day()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'game_core', 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.cancelled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reservation_status NOT IN ('reserved', 'confirmed', 'consumed') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.cancelled_at IS NULL
     AND OLD.reservation_status IN ('reserved', 'confirmed', 'consumed') THEN
    RETURN NEW;
  END IF;

  PERFORM game_core.fn_record_operator_player_play_day(
    NEW.player_user_id,
    COALESCE(NEW.created_at, now())
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_operator_play_day ON public.tickets;
CREATE TRIGGER trg_tickets_operator_play_day
  AFTER INSERT OR UPDATE OF reservation_status, cancelled_at
  ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION game_core.fn_trg_tickets_operator_play_day();

ALTER TABLE public.operator_player_play_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY operator_player_play_days_admin_read
  ON public.operator_player_play_days
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'::public.user_role
    )
  );

CREATE POLICY operator_player_play_days_agent_read
  ON public.operator_player_play_days
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'agent'::public.user_role
        AND operator_player_play_days.operator_id = u.id
        AND operator_player_play_days.operator_role = 'agent'
    )
  );

CREATE POLICY operator_player_play_days_super_read
  ON public.operator_player_play_days
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'super'::public.user_role
        AND operator_player_play_days.operator_id = u.id
        AND operator_player_play_days.operator_role = 'super'
    )
  );

REVOKE ALL ON TABLE public.operator_player_play_days FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.operator_player_play_days TO authenticated, service_role;

REVOKE ALL ON FUNCTION game_core.fn_record_operator_player_play_day(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION game_core.fn_record_operator_player_play_day(uuid, timestamptz)
  TO postgres, service_role;

-- Backfill from existing tickets (unique player per operator per UTC day).
INSERT INTO public.operator_player_play_days (
  stat_date, operator_id, operator_role, player_id, first_seen_at
)
SELECT DISTINCT ON (
  (t.created_at AT TIME ZONE 'UTC')::date,
  pa.agent_id,
  t.player_user_id
)
  (t.created_at AT TIME ZONE 'UTC')::date,
  pa.agent_id,
  'agent',
  t.player_user_id,
  t.created_at
FROM public.tickets t
JOIN public.player_affiliation pa ON pa.user_id = t.player_user_id
WHERE t.cancelled_at IS NULL
  AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
  AND pa.agent_id IS NOT NULL
ORDER BY
  (t.created_at AT TIME ZONE 'UTC')::date,
  pa.agent_id,
  t.player_user_id,
  t.created_at
ON CONFLICT (stat_date, operator_id, operator_role, player_id) DO NOTHING;

INSERT INTO public.operator_player_play_days (
  stat_date, operator_id, operator_role, player_id, first_seen_at
)
SELECT DISTINCT ON (
  (t.created_at AT TIME ZONE 'UTC')::date,
  pa.super_id,
  t.player_user_id
)
  (t.created_at AT TIME ZONE 'UTC')::date,
  pa.super_id,
  'super',
  t.player_user_id,
  t.created_at
FROM public.tickets t
JOIN public.player_affiliation pa ON pa.user_id = t.player_user_id
WHERE t.cancelled_at IS NULL
  AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
  AND pa.super_id IS NOT NULL
ORDER BY
  (t.created_at AT TIME ZONE 'UTC')::date,
  pa.super_id,
  t.player_user_id,
  t.created_at
ON CONFLICT (stat_date, operator_id, operator_role, player_id) DO NOTHING;

COMMIT;
