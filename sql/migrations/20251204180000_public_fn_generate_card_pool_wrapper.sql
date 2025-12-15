-- Migration: public wrapper for fn_generate_card_pool
-- تاریخ: 2025-12-04
--
-- هدف: فراهم کردن دسترسی RPC از طریق schema public به تابع game_core.fn_generate_card_pool

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_generate_card_pool(
  p_card_count integer DEFAULT 10000,
  p_created_by uuid DEFAULT NULL,
  p_prng_version text DEFAULT 'v1'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN game_core.fn_generate_card_pool(
    p_card_count := p_card_count,
    p_created_by := p_created_by,
    p_prng_version := p_prng_version
  );
END;
$function$;

ALTER FUNCTION public.fn_generate_card_pool(integer, uuid, text) OWNER TO postgres;

COMMENT ON FUNCTION public.fn_generate_card_pool(integer, uuid, text) IS 
  'Wrapper function to call game_core.fn_generate_card_pool from public schema for RPC access';

COMMIT;