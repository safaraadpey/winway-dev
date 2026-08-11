-- Allow purging KYC image bytes while keeping approval history
ALTER TABLE public.kyc_submissions
  ALTER COLUMN image_data DROP NOT NULL;

ALTER TABLE public.kyc_submissions
  DROP CONSTRAINT IF EXISTS kyc_submissions_image_size_check;

ALTER TABLE public.kyc_submissions
  ADD CONSTRAINT kyc_submissions_image_size_check
  CHECK (
    image_byte_size IS NULL
    OR (image_byte_size >= 0 AND image_byte_size <= 3145728)
  );

ALTER TABLE public.kyc_submissions
  ADD COLUMN IF NOT EXISTS image_purged_at timestamptz NULL;

COMMENT ON COLUMN public.kyc_submissions.image_purged_at IS
  'When image_data was cleared after admin approve; submission history remains.';
