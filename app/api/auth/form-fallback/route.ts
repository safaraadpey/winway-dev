import { NextResponse } from "next/server";
import {
  AUTH_FORM_FALLBACK_CACHE_CONTROL,
  buildAuthFormFallbackRedirectUrl,
} from "@/lib/auth/formFallback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": AUTH_FORM_FALLBACK_CACHE_CONTROL,
  Pragma: "no-cache",
};

/**
 * No-JS / failed-hydration fallback for auth forms.
 *
 * Intentionally does NOT read request body, formData, query, or cookies
 * for credentials — never log password/token/username from this handler.
 */
export async function POST(request: Request) {
  // Do not touch request body. Redirect only.
  const location = buildAuthFormFallbackRedirectUrl(request.url);
  console.info("[Auth][FormFallback] rejected native form POST; redirecting to login");
  return NextResponse.redirect(location, {
    status: 303,
    headers: NO_STORE_HEADERS,
  });
}

export async function GET(request: Request) {
  const location = buildAuthFormFallbackRedirectUrl(request.url);
  return NextResponse.redirect(location, {
    status: 303,
    headers: NO_STORE_HEADERS,
  });
}
