-- Dev schedule worker cron (replaces legacy bot-schedule-worker).
-- Requires pg_cron + pg_net. Set service role key in Vault before enabling:
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'dev_schedule_worker_service_key');
--
-- ========== DISABLE (legacy name) ==========
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('bot-schedule-worker', 'dev-schedule-worker');

-- ========== ENABLE ==========
-- SELECT cron.schedule(
--   'dev-schedule-worker',
--   '* * * * *',
--   $$
--   SELECT net.http_post(
--     url := current_setting('app.settings.supabase_url', true) || '/functions/v1/dev-schedule-worker',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (
--         SELECT decrypted_secret
--         FROM vault.decrypted_secrets
--         WHERE name = 'dev_schedule_worker_service_key'
--         LIMIT 1
--       )
--     ),
--     body := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );
