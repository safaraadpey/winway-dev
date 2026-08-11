-- Phase 0 (room-actor game loop): SLO measurement surface.
-- Reporting views so latency/health is sourced from DB, not stdout logs.
BEGIN;

-- Per-draw latency decomposition for the last 24h of processed draws.
CREATE OR REPLACE VIEW public.v_draw_latency_recent AS
SELECT
  d.room_id,
  r.room_code,
  d.number AS draw_number,
  d.created_at,
  d.processed_at,
  d.queue_wait_ms,
  d.processing_ms,
  d.finalize_ms,
  GREATEST(
    0,
    ROUND(EXTRACT(EPOCH FROM (d.processed_at - d.created_at)) * 1000)::integer
  ) AS total_latency_ms
FROM public.draws d
JOIN public.rooms r ON r.id = d.room_id
WHERE d.processed_at IS NOT NULL
  AND d.created_at > now() - interval '24 hours';

COMMENT ON VIEW public.v_draw_latency_recent IS
  'Per-draw latency decomposition (last 24h). total_latency_ms = processed_at - created_at.';

-- Aggregated SLO snapshot: p50/p95/p99 total latency over the last hour.
CREATE OR REPLACE VIEW public.v_draw_latency_slo AS
SELECT
  COUNT(*)::integer AS draws_last_hour,
  ROUND(AVG(total_latency_ms))::integer AS avg_latency_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_latency_ms)::integer AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_latency_ms)::integer AS p95_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY total_latency_ms)::integer AS p99_latency_ms,
  MAX(total_latency_ms)::integer AS max_latency_ms,
  COUNT(*) FILTER (WHERE total_latency_ms > 3000)::integer AS over_3s,
  COUNT(*) FILTER (WHERE total_latency_ms > 5000)::integer AS over_5s
FROM public.v_draw_latency_recent
WHERE created_at > now() - interval '1 hour';

COMMENT ON VIEW public.v_draw_latency_slo IS
  'Rollup SLO row: p50/p95/p99 total draw latency (last 1h). Target p95 < 3000ms.';

-- Live engine health: active rooms, unprocessed draws, settlement lag.
CREATE OR REPLACE VIEW public.v_engine_loop_health AS
SELECT
  (SELECT COUNT(*) FROM public.rooms WHERE status = 'playing')::integer
    AS active_playing_rooms,
  (SELECT COUNT(*) FROM public.draws WHERE processed_at IS NULL)::integer
    AS unprocessed_draws,
  (SELECT COUNT(*) FROM public.draw_jobs WHERE status = 'queued')::integer
    AS queued_jobs,
  (SELECT COUNT(*) FROM public.draw_jobs WHERE status = 'processing')::integer
    AS processing_jobs,
  (SELECT COUNT(*) FROM public.rooms WHERE status = 'settling')::integer
    AS rooms_settling,
  (
    SELECT COALESCE(
      ROUND(EXTRACT(EPOCH FROM (now() - MIN(r.updated_at))))::integer,
      0
    )
    FROM public.rooms r
    WHERE r.status = 'settling'
  ) AS oldest_settling_age_sec;

COMMENT ON VIEW public.v_engine_loop_health IS
  'Live health for the room game loop: active rooms, unprocessed draws, queue depth, settlement lag.';

GRANT SELECT ON public.v_draw_latency_recent TO service_role;
GRANT SELECT ON public.v_draw_latency_slo TO service_role;
GRANT SELECT ON public.v_engine_loop_health TO service_role;

COMMIT;
