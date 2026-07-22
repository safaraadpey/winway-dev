import { getMainOrigin } from "@/lib/auth/portalHosts";

export function buildRegistrationLinkPath(referralCode: string): string {
  const code = referralCode.trim().toUpperCase();
  return `/register?ref=${encodeURIComponent(code)}`;
}

export function buildRegistrationLink(referralCode: string): string {
  return `${getMainOrigin()}${buildRegistrationLinkPath(referralCode)}`;
}
