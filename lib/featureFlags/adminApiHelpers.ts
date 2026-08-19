import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow, logAdminAction } from "@/lib/supabaseServer";
import { verifyAdminZeroAccess } from "@/lib/featureFlags/adminZero";

export async function requireAdminZeroContext(request: NextRequest) {
  const { session, supabase } = await getAdminContextOrThrow(request);

  const allowed = await verifyAdminZeroAccess(session.user.id);
  if (!allowed) {
    throw new Error("FORBIDDEN_ADMINZERO");
  }

  return { session, supabase };
}

export function mapAdminApiError(err: unknown) {
  const message = err instanceof Error ? err.message : "unexpected error";

  if (message === "UNAUTHORIZED") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "missing or invalid session" },
      { status: 401 }
    );
  }

  if (message === "FORBIDDEN" || message === "FORBIDDEN_ADMINZERO") {
    return NextResponse.json(
      {
        ok: false,
        error: "forbidden",
        message: "only adminzero can access feature management",
      },
      { status: 403 }
    );
  }

  return NextResponse.json(
    { ok: false, error: "unexpected_error", message },
    { status: 500 }
  );
}

export { logAdminAction };
