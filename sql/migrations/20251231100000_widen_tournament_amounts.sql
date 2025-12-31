-- Widen tournament monetary fields to allow larger values (up to ~100B with 2 decimals)
ALTER TABLE public.tournaments
  ALTER COLUMN ticket_price TYPE numeric(12,2),
  ALTER COLUMN guaranteed_prize TYPE numeric(12,2);

