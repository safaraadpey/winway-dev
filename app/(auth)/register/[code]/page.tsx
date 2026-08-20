import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignupForm from "@/components/auth/SignupForm";
import { normalizeReferralCodeSegment } from "@/lib/referral/normalizeReferralCode";
import { buildRegisterPageMetadata } from "@/lib/referral/registerPageMetadata";

type RegisterWithCodePageProps = {
  params: { code: string };
};

export function generateMetadata({
  params,
}: RegisterWithCodePageProps): Metadata {
  return buildRegisterPageMetadata({ referralCode: params.code });
}

export default function RegisterWithCodePage({
  params,
}: RegisterWithCodePageProps) {
  const normalizedCode = normalizeReferralCodeSegment(params.code);
  const encodedNormalized = encodeURIComponent(normalizedCode);

  if (params.code !== encodedNormalized) {
    redirect(`/register/${encodedNormalized}`);
  }

  return <SignupForm initialReferralCode={normalizedCode} />;
}
