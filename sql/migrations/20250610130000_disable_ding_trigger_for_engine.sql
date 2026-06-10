-- Engine mode aggregates ding in TypeScript after rpc_finalize_engine_draw_job.
-- Disable the trigger to avoid double-credit and the expensive tickets/card_numbers join.
BEGIN;

ALTER TABLE public.draws DISABLE TRIGGER trg_aggregate_ding_on_processed_at;

COMMIT;
