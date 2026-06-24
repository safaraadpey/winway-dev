-- draw_jobs retention: purge done/failed queue rows older than 7 days (aligned with draws).
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

  -- draw_jobs: 7 days (done/failed only; live queue rows must remain)
  DELETE FROM public.draw_jobs
  WHERE status IN ('done', 'failed')
    AND created_at < now() - interval '7 days';

  -- ding_transactions: 7 days
  DELETE FROM public.ding_transactions
  WHERE created_at < now() - interval '7 days';

  -- commissions_log: 35 days
  DELETE FROM public.commissions_log
  WHERE created_at < now() - interval '35 days';

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
