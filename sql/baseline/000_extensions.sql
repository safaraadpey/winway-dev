--
-- WinWay / DingMoney — required extensions for schema baseline
-- Apply BEFORE 001_schema.sql on an empty Supabase Postgres project.
-- Extensions live in schema "extensions" on hosted Supabase.
--

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Optional / platform-managed on Supabase (enable if missing on clone target):
-- CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;
-- CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA extensions;
-- CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA pg_catalog;
-- CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;
