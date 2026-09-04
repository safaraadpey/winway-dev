import { NextRequest, NextResponse } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { isSelfAuthenticatedApiPath } from "@/lib/supabase/middlewareAuthPolicy";
import { sampledLog } from "@/lib/observability/sampledLog";
import {
  getWatchGuestCookieName,
  isGuestBlockedPlayerPath,
} from "@/lib/watch-invite/guestCookie";
import { parseWatchGuestCookieEdge } from "@/lib/watch-invite/guestCookieEdge";

const DEFAULT_MAIN_HOST = "dingmoney.org";
const DEFAULT_ADMIN_HOST = "admin.dingmoney.org";

function getHost(req: NextRequest): string {
  return (req.headers.get("host") || "").split(":")[0].toLowerCase();
}

function buildRedirectUrl(req: NextRequest, targetHost: string): URL {
  const url = req.nextUrl.clone();
  url.protocol = "https:";
  url.host = targetHost;
  return url;
}

function nextWithPathname(req: NextRequest, pathname: string): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export async function middleware(req: NextRequest) {
  const host = getHost(req);
  const pathname = req.nextUrl.pathname;

  const mainHost = process.env.MAIN_APP_HOST || DEFAULT_MAIN_HOST;
  const adminHost = process.env.ADMIN_APP_HOST || DEFAULT_ADMIN_HOST;

  const isMainHost = host === mainHost || host === `www.${mainHost}`;
  if (
    isMainHost &&
    (pathname.startsWith("/admin") || pathname.startsWith("/dev-panel"))
  ) {
    return NextResponse.redirect(buildRedirectUrl(req, adminHost));
  }

  // Self-authenticated Bearer APIs — skip Edge getUser(); route handler verifies token.
  if (isSelfAuthenticatedApiPath(pathname)) {
    sampledLog(
      "middleware:skip",
      "[Middleware] skip getUser",
      { mode: "skip", pathPrefix: pathname.split("/").slice(0, 3).join("/") },
      100
    );
    return nextWithPathname(req, pathname);
  }

  const { response, user } = await updateSupabaseSession(req, { pathname });

  const guestRaw = req.cookies.get(getWatchGuestCookieName())?.value;
  const guest = await parseWatchGuestCookieEdge(guestRaw);

  if (guest && !user && isGuestBlockedPlayerPath(pathname)) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = guest.p;
    redirectUrl.search = "";
    console.log("[WatchInvite] Guest redirect from player route", {
      pathname,
      watchPath: guest.p,
    });
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest|woff2|woff|ttf|otf|css|json|txt|xml|map|ico)$).*)",
  ],
};
