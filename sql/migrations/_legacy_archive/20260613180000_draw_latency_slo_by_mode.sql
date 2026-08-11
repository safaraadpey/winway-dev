-- Phase 5 (rollout): split the SLO by draw path so each rollout stage can be
-- compared side by side. Actor-path draws are stamped with actor_inserted_at;
-- queue-path draws are not. Lets us watch actor p95 < 3000ms before widening.
BEGIN;

CREATE OR REPLACE VIEW public.v_draw_latency_slo_by_mode AS
WITH recent AS (
  SELECT
    CASE WHEN d.actor_inserted_at IS NOT NULL THEN 'actor' ELSE 'queue' END AS loop_mode,
    GREATEST(
      0,
      ROUND(EXTRACT(EPOCH FROM (d.processed_at - d.created_at)) * 1000)::integer
    ) AS total_latency_ms
  FROM public.draws d
  WHERE d.processed_at IS NOT NULL
    AND d.created_at > now() - interval '1 hour'
)
SELECT
  loop_mode,
  COUNT(*)::integer AS draws,
  ROUND(AVG(total_latency_ms))::integer AS avg_latency_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_latency_ms)::integer AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_latency_ms)::integer AS p95_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY total_latency_ms)::integer AS p99_latency_ms,
  MAX(total_latency_ms)::integer AS max_latency_ms,
  COUNT(*) FILTER (WHERE total_latency_ms > 3000)::integer AS over_3s
FROM recent
GROUP BY loop_mode;

COMMENT ON VIEW public.v_draw_latency_slo_by_mode IS
  'Per-path SLO (last 1h): actor vs queue. Watch actor p95 < 3000ms during rollout.';

GRANT SELECT ON public.v_draw_latency_slo_by_mode TO service_role;

COMMIT;
