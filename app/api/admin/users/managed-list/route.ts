import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import { loadManagedUsersSnapshot } from "@/lib/users/loadManagedUsersSnapshot";
import type { ManagedUserRole, ManagedUserRoleFilter } from "@/src/types/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ROLES = new Set<ManagedUserRole>(["admin", "super", "agent"]);
const VALID_FILTERS = new Set<ManagedUserRoleFilter>(["all", "player", "agent", "super"]);

/**
 * GET /api/admin/users/managed-list?roleFilter=all|player|agent|super&search=
 */
export async function GET(request: NextRequest) {
  try {
    const { session } = await getAdminContextOrThrow(request);

    if (!VALID_ROLES.has(session.role as ManagedUserRole)) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی کافی نیست." },
        { status: 403 }
      );
    }

    const roleFilterParam = String(
      request.nextUrl.searchParams.get("roleFilter") || "all"
    ).trim() as ManagedUserRoleFilter;
    const search = String(request.nextUrl.searchParams.get("search") || "").trim();

    if (!VALID_FILTERS.has(roleFilterParam)) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "roleFilter نامعتبر است." },
        { status: 400 }
      );
    }

    const data = await loadManagedUsersSnapshot({
      viewerUserId: session.user.id,
      viewerRole: session.role as ManagedUserRole,
      roleFilter: roleFilterParam,
      search,
    });

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "جلسه معتبر نیست." },
        { status: 401 }
      );
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی کافی نیست." },
        { status: 403 }
      );
    }
    console.error("[Users] managed-list unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: message || "خطای غیرمنتظره" },
      { status: 500 }
    );
  }
}
