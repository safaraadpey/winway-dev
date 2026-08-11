-- Rename admin_sub_role enum value: bot_admin -> dev_panel
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'admin_sub_role'
      AND e.enumlabel = 'bot_admin'
  ) THEN
    ALTER TYPE public.admin_sub_role RENAME VALUE 'bot_admin' TO 'dev_panel';
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'admin_sub_role'
      AND e.enumlabel = 'dev_panel'
  ) THEN
    ALTER TYPE public.admin_sub_role ADD VALUE 'dev_panel';
  END IF;
END $$;

COMMENT ON COLUMN public.users.admin_sub_role IS
  'Sub-role for admin users: null/manager (full admin), finance, support, room, dev_panel';

COMMIT;
