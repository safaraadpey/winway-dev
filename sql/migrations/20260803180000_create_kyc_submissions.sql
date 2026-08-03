-- KYC identity verification submissions (temporary unencrypted image storage for manual review)
CREATE TABLE IF NOT EXISTS public.kyc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kyc_code text NOT NULL,
  declaration_text text NOT NULL,
  image_data bytea NOT NULL,
  image_mime_type text NOT NULL DEFAULT 'image/jpeg',
  image_byte_size integer NOT NULL,
  quality_checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'expired')),
  client_request_id text NOT NULL,
  rejection_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kyc_submissions_user_client_request_unique UNIQUE (user_id, client_request_id),
  CONSTRAINT kyc_submissions_image_size_check CHECK (image_byte_size > 0 AND image_byte_size <= 3145728)
);

CREATE INDEX IF NOT EXISTS kyc_submissions_user_id_created_at_idx
  ON public.kyc_submissions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS kyc_submissions_status_created_at_idx
  ON public.kyc_submissions (status, created_at DESC);

-- At most one pending review submission per user (idempotent retries use same client_request_id)
CREATE UNIQUE INDEX IF NOT EXISTS kyc_submissions_one_pending_per_user
  ON public.kyc_submissions (user_id)
  WHERE status = 'pending_review';

ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.kyc_submissions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.kyc_submissions TO service_role;

COMMENT ON TABLE public.kyc_submissions IS
  'Player KYC selfie+document submissions. Images stored temporarily unencrypted for manual review.';
