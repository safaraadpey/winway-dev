BEGIN;

ALTER TABLE public.heartbeat_log RENAME TO heartbeat_log_old;

CREATE TABLE public.heartbeat_log (
  id bigint NOT NULL DEFAULT nextval('heartbeat_log_id_seq'::regclass),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

DO $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT generate_series(current_date - interval '3 days', current_date + interval '2 days', interval '1 day')::date
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.heartbeat_log_p%s PARTITION OF public.heartbeat_log FOR VALUES FROM (%L) TO (%L);',
      to_char(d, 'YYYYMMDD'),
      d,
      d + 1
    );
  END LOOP;
END$$;

CREATE TABLE IF NOT EXISTS public.heartbeat_log_default
  PARTITION OF public.heartbeat_log DEFAULT;

INSERT INTO public.heartbeat_log (id, created_at)
SELECT id, created_at
FROM public.heartbeat_log_old;

SELECT setval(
  'heartbeat_log_id_seq',
  COALESCE((SELECT MAX(id) FROM public.heartbeat_log), 0),
  true
);

DROP TABLE public.heartbeat_log_old;

COMMIT;

