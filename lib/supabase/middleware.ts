import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sampledLog } from "@/lib/observability/sampledLog";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

type UpdateSupabaseSessionOptions = {
  pathname?: string;
};

/**
 * Refreshes Supabase auth cookies on each matched request.
 * Must run before Server Components/layouts read the session.
 */
export async function updateSupabaseSession(
  request: NextRequest,
  options?: UpdateSupabaseSessionOptions
): Promise<{ response: NextResponse; user: { id: string } | null }> {
  const requestHeaders = new Headers(request.headers);
  if (options?.pathname) {
    requestHeaders.set("x-pathname", options.pathname);
  }

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  const { url, anonKey } = getSupabasePublicEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request: { headers: requestHeaders },
        });

        cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
          response.cookies.set(name, value, cookieOptions);
        });
      },
    },
  });

  // Triggers token refresh when needed and writes updated cookies to the response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  sampledLog(
    "middleware:getUser",
    "[Middleware] getUser",
    {
      mode: "getUser",
      pathPrefix: options?.pathname?.split("/").slice(0, 2).join("/") ?? "unknown",
      hasUser: Boolean(user),
    },
    100
  );

  return { response, user };
}
