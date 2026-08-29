import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  WATCH_GUEST_COOKIE_MAX_AGE_SEC,
  WATCH_GUEST_COOKIE_NAME,
  WATCH_INVITE_TOKEN_ALPHABET,
  WATCH_INVITE_TOKEN_LENGTH,
} from "@/lib/watch-invite/constants";
import { buildWatchInvitePath } from "@/lib/watch-invite/buildWatchLink";

export type WatchGuestCookiePayload = {
  w: number;
  i: string;
  p: string;
  exp: number;
};

function cookieSecret(): string {
  return (
    process.env.WATCH_GUEST_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-watch-guest-secret"
  );
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", cookieSecret()).update(encodedPayload).digest("base64url");
}

export function generateWatchInviteToken(): string {
  const bytes = randomBytes(WATCH_INVITE_TOKEN_LENGTH);
  let token = "";
  for (let idx = 0; idx < WATCH_INVITE_TOKEN_LENGTH; idx += 1) {
    token += WATCH_INVITE_TOKEN_ALPHABET[bytes[idx]! % WATCH_INVITE_TOKEN_ALPHABET.length];
  }
  return token;
}

export function serializeWatchGuestCookie(payload: WatchGuestCookiePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signPayload(encoded);
  return `${encoded}.${sig}`;
}

export function parseWatchGuestCookie(raw: string | undefined | null): WatchGuestCookiePayload | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = signPayload(encoded);
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as WatchGuestCookiePayload;
    if (
      typeof payload.w !== "number" ||
      typeof payload.i !== "string" ||
      typeof payload.p !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildGuestCookiePayload(
  watchCode: number,
  inviteToken: string
): WatchGuestCookiePayload {
  return {
    w: watchCode,
    i: inviteToken,
    p: buildWatchInvitePath(watchCode, inviteToken),
    exp: Math.floor(Date.now() / 1000) + WATCH_GUEST_COOKIE_MAX_AGE_SEC,
  };
}

export function getWatchGuestCookieName(): string {
  return WATCH_GUEST_COOKIE_NAME;
}

export function getWatchGuestCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: WATCH_GUEST_COOKIE_MAX_AGE_SEC,
  };
}

export function isGuestPathAllowed(pathname: string): boolean {
  if (
    pathname.startsWith("/watch/t/") ||
    pathname.startsWith("/api/watch/") ||
    pathname.startsWith("/register") ||
    pathname === "/signup" ||
    pathname === "/login" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/themes/") ||
    pathname.startsWith("/api/auth")
  ) {
    return true;
  }
  return false;
}
