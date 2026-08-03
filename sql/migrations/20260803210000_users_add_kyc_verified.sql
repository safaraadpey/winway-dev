-- Denormalized KYC badge flag for fast client reads
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS kyc_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.kyc_verified IS
  'True when player has an approved KYC submission; drives verified badge in UI.';

-- Backfill from approved submissions
UPDATE public.users u
SET kyc_verified = true
WHERE EXISTS (
  SELECT 1
  FROM public.kyc_submissions k
  WHERE k.user_id = u.id
    AND k.status = 'approved'
);
