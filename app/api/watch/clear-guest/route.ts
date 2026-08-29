import { NextRequest, NextResponse } from "next/server";
import {
  getWatchGuestCookieClearOptions,
  getWatchGuestCookieName,
  getWatchGuestCookieSetPaths,
} from "@/lib/watch-invite/guestCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clearGuestCookie(response: NextResponse) {
  const options = getWatchGuestCookieClearOptions();
  const name = getWatchGuestCookieName();
  for (const path of getWatchGuestCookieSetPaths()) {
    response.cookies.set(name, "", { ...options, path });
  }
}

export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.searchParams.get("redirect") || "/";
  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  clearGuestCookie(response);
  console.log("[WatchInvite] Guest cookie cleared via GET");
  return response;
}

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearGuestCookie(response);
  console.log("[WatchInvite] Guest cookie cleared");
  return response;
}
