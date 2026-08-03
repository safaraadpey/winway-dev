-- Admin review + player entry notification tracking for KYC
ALTER TABLE public.kyc_submissions
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason_code text NULL,
  ADD COLUMN IF NOT EXISTS player_result_seen_at timestamptz NULL;

ALTER TABLE public.kyc_submissions
  DROP CONSTRAINT IF EXISTS kyc_submissions_rejection_reason_code_check;

ALTER TABLE public.kyc_submissions
  ADD CONSTRAINT kyc_submissions_rejection_reason_code_check
  CHECK (
    rejection_reason_code IS NULL
    OR rejection_reason_code IN (
      'blurry',
      'cards_unreadable',
      'wrong_text',
      'invalid_kyc_code'
    )
  );

CREATE INDEX IF NOT EXISTS kyc_submissions_pending_review_idx
  ON public.kyc_submissions (created_at ASC)
  WHERE status = 'pending_review';

CREATE INDEX IF NOT EXISTS kyc_submissions_unseen_result_idx
  ON public.kyc_submissions (user_id, updated_at DESC)
  WHERE status IN ('approved', 'rejected') AND player_result_seen_at IS NULL;

COMMENT ON COLUMN public.kyc_submissions.player_result_seen_at IS
  'Set when the player dismisses the entry popup for this review result.';
