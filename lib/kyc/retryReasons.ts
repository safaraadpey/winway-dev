export const KYC_RETRY_REASONS = [
  { code: "blurry", label: "عکس تار" },
  { code: "cards_unreadable", label: "کارت‌ها ناخواناست" },
  { code: "wrong_text", label: "متن نوشته‌شده اشتباه است" },
  { code: "invalid_kyc_code", label: "کد KYC نامعتبر یا اشتباه وارد شده" },
] as const;

export type KycRetryReasonCode = (typeof KYC_RETRY_REASONS)[number]["code"];

export function getKycRetryReasonLabel(
  code: string | null | undefined
): string | null {
  if (!code) return null;
  const found = KYC_RETRY_REASONS.find((r) => r.code === code);
  return found?.label ?? null;
}

export function isKycRetryReasonCode(code: string): code is KycRetryReasonCode {
  return KYC_RETRY_REASONS.some((r) => r.code === code);
}
