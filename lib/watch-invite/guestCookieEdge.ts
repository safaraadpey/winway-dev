import type { WatchGuestCookiePayload } from "@/lib/watch-invite/guestCookie";

function cookieSecret(): string {
  return (
    process.env.WATCH_GUEST_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-watch-guest-secret"
  );
}

async function signPayload(encodedPayload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(cookieSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );
  return Buffer.from(signature).toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export async function parseWatchGuestCookieEdge(
  raw: string | undefined | null
): Promise<WatchGuestCookiePayload | null> {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const encoded = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = await signPayload(encoded);

  if (sig.length !== expected.length) return null;
  let valid = true;
  for (let i = 0; i < sig.length; i += 1) {
    if (sig.charCodeAt(i) !== expected.charCodeAt(i)) {
      valid = false;
    }
  }
  if (!valid) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(encoded)) as WatchGuestCookiePayload;
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
