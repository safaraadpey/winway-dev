export const REFERRAL_CODE_UPDATED_EVENT = "winway:referral-code-updated";

export type ReferralCodeUpdatedDetail = {
  referralCode: string;
};

export function publishReferralCodeUpdated(referralCode: string): void {
  if (typeof window === "undefined") return;

  const normalizedCode = referralCode.trim().toUpperCase();
  if (!normalizedCode) return;

  window.dispatchEvent(
    new CustomEvent<ReferralCodeUpdatedDetail>(REFERRAL_CODE_UPDATED_EVENT, {
      detail: { referralCode: normalizedCode },
    })
  );
}
