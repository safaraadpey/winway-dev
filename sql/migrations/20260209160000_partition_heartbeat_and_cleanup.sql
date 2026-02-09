BEGIN;

-- Partition heartbeat_log by created_at (conservative: no FK dependencies).
ALTER TABLE public.heartbeat_log RENAME TO heartbeat_log_default;

CREATE TABLE public.heartbeat_log (
  id bigint NOT NULL DEFAULT nextval('heartbeat_log_id_seq'::regclass),
  created_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

ALTER TABLE public.heartbeat_log
  ATTACH PARTITION public.heartbeat_log_default DEFAULT;

DO $$
DECLARE
  d date;
BEGIN
  FOR i IN 1..7 LOOP
    d := current_date + i;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.heartbeat_log_%s PARTITION OF public.heartbeat_log FOR VALUES FROM (%L) TO (%L);',
      to_char(d,'YYYYMMDD'),
      d::timestamptz,
      (d + 1)::timestamptz
    );
  END LOOP;
END$$;

CREATE OR REPLACE FUNCTION public.fn_maintain_heartbeat_log_partitions(
  p_keep_days int DEFAULT 2,
  p_future_days int DEFAULT 7
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  d date;
  v_cutoff date := current_date - p_keep_days;
  r record;
  v_part_date date;
BEGIN
  -- Create partitions for upcoming days
  FOR i IN 1..p_future_days LOOP
    d := current_date + i;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.heartbeat_log_%s PARTITION OF public.heartbeat_log FOR VALUES FROM (%L) TO (%L);',
      to_char(d,'YYYYMMDD'),
      d::timestamptz,
      (d + 1)::timestamptz
    );
  END LOOP;

  -- Drop partitions older than retention
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE i.inhparent = 'public.heartbeat_log'::regclass
      AND c.relname LIKE 'heartbeat_log_%'
      AND c.relname <> 'heartbeat_log_default'
  LOOP
    v_part_date := to_date(substring(r.relname from 'heartbeat_log_(\\d{8})'), 'YYYYMMDD');
    IF v_part_date IS NOT NULL AND v_part_date < v_cutoff THEN
      EXECUTE format('DROP TABLE IF EXISTS %I.%I', r.nspname, r.relname);
    END IF;
  END LOOP;

  -- Cleanup default partition (legacy rows before partitioning)
  DELETE FROM public.heartbeat_log_default
  WHERE created_at < (now() - make_interval(days => p_keep_days));
END;
$function$;

-- Conservative retention cleanup for other tables (no partitioning).
CREATE OR REPLACE FUNCTION public.fn_cleanup_retention()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  -- marks: 24 hours
  DELETE FROM public.marks
  WHERE created_at < now() - interval '1 day';

  -- draws: 7 days (delete dependent ding_transactions first)
  WITH old_draws AS (
    SELECT id FROM public.draws WHERE created_at < now() - interval '7 days'
  )
  DELETE FROM public.ding_transactions dt
  USING old_draws od
  WHERE dt.draw_id = od.id;

  DELETE FROM public.draws
  WHERE created_at < now() - interval '7 days';

  -- ding_transactions: 7 days
  DELETE FROM public.ding_transactions
  WHERE created_at < now() - interval '7 days';

  -- commissions_log: 30 days
  DELETE FROM public.commissions_log
  WHERE created_at < now() - interval '30 days';

  -- tickets: 7 days (delete dependents first)
  WITH old_tickets AS (
    SELECT id FROM public.tickets WHERE created_at < now() - interval '7 days'
  )
  DELETE FROM public.marks m
  USING old_tickets ot
  WHERE m.ticket_id = ot.id;

  WITH old_tickets AS (
    SELECT id FROM public.tickets WHERE created_at < now() - interval '7 days'
  )
  DELETE FROM public.commissions_log c
  USING old_tickets ot
  WHERE c.ticket_id = ot.id;

  WITH old_tickets AS (
    SELECT id FROM public.tickets WHERE created_at < now() - interval '7 days'
  )
  DELETE FROM public.ding_transactions d
  USING old_tickets ot
  WHERE d.ticket_id = ot.id;

  WITH old_tickets AS (
    SELECT id FROM public.tickets WHERE created_at < now() - interval '7 days'
  )
  DELETE FROM public.results r
  USING old_tickets ot
  WHERE r.ticket_id = ot.id;

  WITH old_tickets AS (
    SELECT id FROM public.tickets WHERE created_at < now() - interval '7 days'
  )
  DELETE FROM public.tickets t
  USING old_tickets ot
  WHERE t.id = ot.id;
END;
$function$;

-- Schedule maintenance jobs (pg_cron).
DO $$
BEGIN
  PERFORM cron.unschedule('heartbeat_log_partitions');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END$$;
SELECT cron.schedule(
  'heartbeat_log_partitions',
  '10 3 * * *',
  $$SELECT public.fn_maintain_heartbeat_log_partitions(2, 7);$$
);

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup_retention');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END$$;
SELECT cron.schedule(
  'cleanup_retention',
  '30 3 * * *',
  $$SELECT public.fn_cleanup_retention();$$
);

COMMIT;

