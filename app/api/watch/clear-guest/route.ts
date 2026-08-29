import { NextResponse } from "next/server";
import { getWatchGuestCookieName } from "@/lib/watch-invite/guestCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getWatchGuestCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  console.log("[WatchInvite] Guest cookie cleared");
  return response;
}
