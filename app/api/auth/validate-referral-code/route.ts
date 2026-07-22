import { NextResponse } from "next/server";
import { validateSignupReferralCode } from "@/lib/referral/validateSignupReferralCode";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code : "";

    if (!code.trim()) {
      return NextResponse.json(
        { valid: false, message: "کد معرف الزامی است" },
        { status: 400 }
      );
    }

    const result = await validateSignupReferralCode(code);

    if (!result.valid) {
      return NextResponse.json(
        { valid: false, message: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      normalizedCode: result.normalizedCode,
      referrerRole: result.referrerRole,
    });
  } catch (error) {
    console.error("[SignupReferral] POST /api/auth/validate-referral-code failed:", error);
    return NextResponse.json(
      {
        valid: false,
        message: "خطا در بررسی کد معرف. لطفاً دوباره تلاش کنید",
      },
      { status: 500 }
    );
  }
}
