import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import { canViewManagedUserStats } from "@/lib/auth/canViewManagedUserStats";
import { loadUserAccountDetailsSnapshot } from "@/lib/users/loadUserAccountDetailsSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

/**
 * GET /api/admin/users/:id/details
 *
 * Aggregated user account snapshot (profile, week stats, transactions).
 * Day / overall / range remain lazy-loaded via separate endpoints.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);
    if (!["admin", "super", "agent"].includes(session.role)) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی کافی نیست." },
        { status: 403 }
      );
    }

    const targetUserId = String(context.params?.id || "").trim();
    if (!targetUserId) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "شناسه کاربر الزامی است." },
        { status: 400 }
      );
    }

    const allowed = await canViewManagedUserStats(
      supabase,
      session.user.id,
      session.role,
      targetUserId
    );
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "اجازه مشاهده این کاربر را ندارید." },
        { status: 403 }
      );
    }

    const { data: targetUser } = await supabase
      .from("users")
      .select("id, role, admin_sub_role")
      .eq("id", targetUserId)
      .maybeSingle();

    if (!targetUser) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "کاربر یافت نشد." },
        { status: 404 }
      );
    }

    if ((targetUser as { admin_sub_role?: string | null }).admin_sub_role === "dev_panel") {
      const { data: adminZero } = await supabase
        .from("users")
        .select("id")
        .eq("username", "adminzero")
        .eq("role", "admin")
        .maybeSingle();

      if (!adminZero?.id || session.user.id !== adminZero.id) {
        return NextResponse.json(
          { ok: false, error: "forbidden", message: "دسترسی به این حساب مجاز نیست." },
          { status: 403 }
        );
      }
    }

    const data = await loadUserAccountDetailsSnapshot({
      targetUserId,
      viewerUserId: session.user.id,
    });

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "اطلاعات حساب کاربر در دسترس نیست." },
        { status: 404 }
      );
    }

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
    console.error("[UserAccount] details unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: message || "خطای غیرمنتظره" },
      { status: 500 }
    );
  }
}
