import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignupForm from "@/components/auth/SignupForm";
import { normalizeReferralCodeSegment } from "@/lib/referral/normalizeReferralCode";
import { buildRegisterPageMetadata } from "@/lib/referral/registerPageMetadata";

type RegisterPageProps = {
  searchParams: { ref?: string | string[] };
};

export function generateMetadata({
  searchParams,
}: RegisterPageProps): Metadata {
  return buildRegisterPageMetadata({ legacyQueryRef: searchParams.ref });
}

export default function RegisterPage({ searchParams }: RegisterPageProps) {
  const rawRef = Array.isArray(searchParams.ref)
    ? searchParams.ref[0]
    : searchParams.ref;

  if (rawRef?.trim()) {
    const code = normalizeReferralCodeSegment(rawRef);
    redirect(`/register/${encodeURIComponent(code)}`);
  }

  return <SignupForm />;
}
