-- Leo: max concurrent tables per player (0 = cap from selected pool size).

BEGIN;

ALTER TABLE public.leo_user_configs
  ADD COLUMN IF NOT EXISTS max_concurrent_tables integer NOT NULL DEFAULT 0
    CHECK (max_concurrent_tables >= 0);

COMMENT ON COLUMN public.leo_user_configs.max_concurrent_tables IS
  'Max tables joined concurrently in one round burst. 0 = use all templates in active pool.';

COMMIT;
