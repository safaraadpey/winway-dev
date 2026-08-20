import type { Metadata } from "next";
import SignupForm from "@/components/auth/SignupForm";
import { buildRegisterPageMetadata } from "@/lib/referral/registerPageMetadata";

type SignupPageProps = {
  searchParams: { ref?: string | string[] };
};

export function generateMetadata({ searchParams }: SignupPageProps): Metadata {
  return buildRegisterPageMetadata("/signup", searchParams.ref);
}

/**
 * صفحه ثبت‌نام
 * از کامپوننت SignupForm استفاده می‌کند که سیستم username-based دارد
 */
export default function SignupPage() {
  return <SignupForm />;
}
