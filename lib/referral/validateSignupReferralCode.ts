import { createServiceClient } from "@/lib/supabaseServer";
import { validateReferralCodeFormat } from "@/lib/auth-helpers";

export type SignupReferralValidationResult =
  | {
      valid: true;
      normalizedCode: string;
      referrerId: string;
      referrerRole: "admin" | "agent" | "super";
    }
  | {
      valid: false;
      message: string;
    };

function normalizeSignupReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Authoritative signup referral validation (PostgreSQL via service role).
 * Mirrors handle_new_user() referrer resolution rules.
 */
export async function validateSignupReferralCode(
  code: string
): Promise<SignupReferralValidationResult> {
  const normalizedCode = normalizeSignupReferralCode(code);

  if (!validateReferralCodeFormat(normalizedCode)) {
    return {
      valid: false,
      message: "کد باید 3 تا 8 کاراکتر و فقط شامل حروف و اعداد انگلیسی باشد",
    };
  }

  const supabase = createServiceClient();
  const { data: referrer, error } = await supabase
    .from("users")
    .select("id, role, status, referral_code")
    .eq("status", "active")
    .eq("referral_code", normalizedCode)
    .maybeSingle();

  if (error) {
    console.error("[SignupReferral] Failed to validate referral code:", error);
    return {
      valid: false,
      message: "خطا در بررسی کد معرف. لطفاً دوباره تلاش کنید",
    };
  }

  if (!referrer) {
    return {
      valid: false,
      message: "کد معرف معتبر نیست. لطفاً کد صحیح را وارد کنید",
    };
  }

  const role = referrer.role as string;
  if (role === "player") {
    return {
      valid: false,
      message:
        "کد معرف متعلق به player است. فقط agent، super یا admin می‌توانند معرف باشند",
    };
  }

  if (role !== "admin" && role !== "agent" && role !== "super") {
    return {
      valid: false,
      message: "کد معرف معتبر نیست. لطفاً کد صحیح را وارد کنید",
    };
  }

  return {
    valid: true,
    normalizedCode,
    referrerId: referrer.id,
    referrerRole: role,
  };
}
