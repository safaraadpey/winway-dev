import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignupForm from "@/components/auth/SignupForm";
import { normalizeReferralCodeSegment } from "@/lib/referral/normalizeReferralCode";
import { buildRegisterPageMetadata } from "@/lib/referral/registerPageMetadata";

type SignupPageProps = {
  searchParams: { ref?: string | string[] };
};

export function generateMetadata({ searchParams }: SignupPageProps): Metadata {
  const rawRef = Array.isArray(searchParams.ref)
    ? searchParams.ref[0]
    : searchParams.ref;

  if (rawRef?.trim()) {
    return buildRegisterPageMetadata({ referralCode: rawRef });
  }

  return buildRegisterPageMetadata({
    legacySignupPath: true,
    legacyQueryRef: searchParams.ref,
  });
}

/**
 * صفحه ثبت‌نام
 * از کامپوننت SignupForm استفاده می‌کند که سیستم username-based دارد
 */
export default function SignupPage({ searchParams }: SignupPageProps) {
  const rawRef = Array.isArray(searchParams.ref)
    ? searchParams.ref[0]
    : searchParams.ref;

  if (rawRef?.trim()) {
    const code = normalizeReferralCodeSegment(rawRef);
    redirect(`/register/${encodeURIComponent(code)}`);
  }

  return <SignupForm />;
}
