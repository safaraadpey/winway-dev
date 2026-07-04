import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
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
): Promise<NextResponse> {
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
  await supabase.auth.getUser();

  return response;
}
