import type { Metadata } from "next";
import SignupForm from "@/components/auth/SignupForm";
import { buildRegisterPageMetadata } from "@/lib/referral/registerPageMetadata";

type RegisterPageProps = {
  searchParams: { ref?: string | string[] };
};

export function generateMetadata({
  searchParams,
}: RegisterPageProps): Metadata {
  return buildRegisterPageMetadata("/register", searchParams.ref);
}

export default function RegisterPage() {
  return <SignupForm />;
}
