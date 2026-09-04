/**
 * Middleware auth policy — which paths skip Edge getUser() vs require cookie refresh.
 *
 * Self-authenticated APIs verify Bearer tokens in route handlers (getUserFromRequest
 * or domain guards). Skipping middleware getUser removes duplicate Auth/DB calls.
 */

/** Exact self-auth API paths (no trailing wildcard). */
const SELF_AUTH_API_EXACT = new Set([
  "/api/crypto/check-my-deposit",
  "/api/crypto/deposit-address",
  "/api/user/crypto-addresses",
]);

/** Prefixes for routes that always self-auth with Bearer. */
const SELF_AUTH_API_PREFIXES = ["/api/me/", "/api/player/"] as const;

/**
 * Public static assets that never need session validation.
 * Also excluded via middleware matcher; kept for tests and documentation.
 */
export function isStaticPublicPath(pathname: string): boolean {
  if (pathname === "/favicon.ico" || pathname === "/sw.js") return true;
  if (pathname.startsWith("/_next/static") || pathname.startsWith("/_next/image")) {
    return true;
  }
  return /\.(svg|png|jpg|jpeg|gif|webp|webmanifest|woff2|woff|ttf|otf|css|json|txt|xml|map|ico)$/i.test(
    pathname
  );
}

/** Bearer-authenticated API routes — middleware must not call getUser(). */
export function isSelfAuthenticatedApiPath(pathname: string): boolean {
  if (SELF_AUTH_API_EXACT.has(pathname)) return true;
  return SELF_AUTH_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
