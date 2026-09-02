import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import { canViewManagedUserStats } from "@/lib/auth/canViewManagedUserStats";
import {
  loadPerformanceLifetimeStats,
  type PerformanceLifetimeRole,
} from "@/lib/dashboard/loadPerformanceLifetimeStats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ROLES = new Set<PerformanceLifetimeRole>(["player", "agent", "super", "admin"]);

/**
 * GET /api/admin/users/lifetime-performance?userId=...&role=player|agent|super|admin
 *
 * Closed overall metrics through last 08:00 Tehran snapshot window.
 * Source of truth: PostgreSQL performance_lifetime_stats.
 */
export async function GET(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);
    if (!["admin", "super", "agent"].includes(session.role)) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی کافی نیست." },
        { status: 403 }
      );
    }

    const userId = String(request.nextUrl.searchParams.get("userId") || "").trim();
    const roleParam = String(request.nextUrl.searchParams.get("role") || "").trim() as PerformanceLifetimeRole;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "userId الزامی است." },
        { status: 400 }
      );
    }

    if (!VALID_ROLES.has(roleParam)) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "role نامعتبر است." },
        { status: 400 }
      );
    }

    const allowed = await canViewManagedUserStats(
      supabase,
      session.user.id,
      session.role,
      userId
    );
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "اجازه مشاهده آمار این کاربر را ندارید." },
        { status: 403 }
      );
    }

    const { data: targetUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (!targetUser || targetUser.role !== roleParam) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "نقش کاربر با درخواست هم‌خوانی ندارد." },
        { status: 400 }
      );
    }

    const data = await loadPerformanceLifetimeStats({ userId, role: roleParam });
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
    console.error("[UserAccount] lifetime-performance unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: message || "خطای غیرمنتظره" },
      { status: 500 }
    );
  }
}
