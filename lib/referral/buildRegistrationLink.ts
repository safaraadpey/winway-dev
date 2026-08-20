import { getMainPublicOrigin } from "@/lib/auth/portalHosts";
import { normalizeReferralCodeSegment } from "@/lib/referral/normalizeReferralCode";

export function buildRegistrationLinkPath(referralCode: string): string {
  const code = normalizeReferralCodeSegment(referralCode);
  return `/register/${encodeURIComponent(code)}`;
}

export function buildRegistrationLink(referralCode: string): string {
  return `${getMainPublicOrigin()}${buildRegistrationLinkPath(referralCode)}`;
}
