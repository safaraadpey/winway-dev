import { NextRequest, NextResponse } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

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

  return updateSupabaseSession(req, { pathname });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
