-- Migration: add commission_rate to tournaments
-- Date: 2026-01-01

BEGIN;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS commission_rate numeric;

COMMIT;

