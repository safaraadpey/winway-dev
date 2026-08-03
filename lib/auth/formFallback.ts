/**
 * Shared no-JS form fallback for auth pages.
 * Credentials must never be read, processed, or logged here.
 */

export const AUTH_FORM_FALLBACK_PATH = "/api/auth/form-fallback";

/** Relative login target — same host, avoids main↔admin redirect loops. */
export const AUTH_FORM_FALLBACK_REDIRECT_PATH = "/login?auth_fallback=1";

export const AUTH_FORM_FALLBACK_CACHE_CONTROL =
  "no-store, no-cache, must-revalidate, private";

export function buildAuthFormFallbackRedirectUrl(
  requestUrl: string | URL
): URL {
  const base = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
  return new URL(AUTH_FORM_FALLBACK_REDIRECT_PATH, base);
}
