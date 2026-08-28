-- Remove feature overrides whose user no longer exists.
-- These rows can remain if users were deleted with FK triggers skipped
-- (e.g. session_replication_role = replica).

BEGIN;

DELETE FROM public.feature_user_overrides AS o
WHERE NOT EXISTS (
  SELECT 1 FROM public.users AS u WHERE u.id = o.user_id
);

COMMIT;
