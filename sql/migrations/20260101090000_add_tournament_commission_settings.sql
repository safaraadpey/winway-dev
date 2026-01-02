-- Migration: add commission settings to tournaments
-- Date: 2026-01-01

BEGIN;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS commission_model text,
  ADD COLUMN IF NOT EXISTS commission_amounts jsonb;

COMMIT;

