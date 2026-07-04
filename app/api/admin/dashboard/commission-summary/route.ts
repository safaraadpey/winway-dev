/**
 * @deprecated Use GET /api/admin/dashboard/snapshot instead.
 * Kept temporarily for backward compatibility; not consumed by the admin dashboard UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";

type CommissionSummary = {
  effectiveUserId: string;
  day: number;
  week: number;
  month: number;
  dayTotal: number;
  weekTotal: number;
  monthTotal: number;
};

export async function GET(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);
    const actorId = session.user.id;

    // Fetch actor row to check parent_id (service role bypasses RLS).
    const { data: actorUser, error: actorErr } = await supabase
      .from("users")
      .select("id, role, parent_id")
      .eq("id", actorId)
      .single();

    if (actorErr || !actorUser) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "کاربر پیدا نشد." },
        { status: 404 }
      );
    }

    if (actorUser.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی غیرمجاز." },
        { status: 403 }
      );
    }

    // Resolve adminzero
    const { data: adminZero, error: adminZeroErr } = await supabase
      .from("users")
      .select("id")
      .eq("username", "adminzero")
      .eq("role", "admin")
      .maybeSingle();

    if (adminZeroErr) {
      console.error("[dashboard/commission-summary] adminzero read error", adminZeroErr);
    }

    const adminZeroId = (adminZero as any)?.id ?? null;

    // Rule: all admin dashboards should monitor the main admin performance.
    // If adminzero exists, use adminzero commission totals for every admin account.
    let effectiveUserId = actorId;
    if (adminZeroId) {
      effectiveUserId = adminZeroId;
    }

    const { data: rows, error: txErr } = await supabase
      .from("transactions")
      .select("amount, created_at")
      .eq("user_id", effectiveUserId)
      .eq("type", "fee_admin")
      .eq("source_kind", "ticket_commission")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()); // month start (client-style)

    if (txErr) {
      console.error("[dashboard/commission-summary] transactions read error", txErr);
      return NextResponse.json(
        { ok: false, error: "db_error", message: "خطا در دریافت تراکنش‌ها." },
        { status: 500 }
      );
    }

    const { data: baseRows, error: baseErr } = await supabase
      .from("commissions_log")
      .select("commission_base, created_at")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

    if (baseErr) {
      console.error("[dashboard/commission-summary] commissions_log read error", baseErr);
      return NextResponse.json(
        { ok: false, error: "db_error", message: "خطا در دریافت کانیات کل." },
        { status: 500 }
      );
    }

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
    const weekStart = new Date(now.getFullYear(), now.getMonth(), diff).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const dayStartMs = new Date(dayStart).getTime();
    const weekStartMs = new Date(weekStart).getTime();
    const monthStartMs = new Date(monthStart).getTime();

    const sumSinceMs = (startMs: number) =>
      (rows || []).reduce((sum, r: any) => {
        const createdAtMs = new Date(String(r.created_at ?? "")).getTime();
        if (!Number.isFinite(createdAtMs) || createdAtMs < startMs) return sum;
        return sum + Number(r.amount || 0);
      }, 0);

    const sumBaseSinceMs = (startMs: number) =>
      (baseRows || []).reduce((sum, r: any) => {
        const createdAtMs = new Date(String(r.created_at ?? "")).getTime();
        if (!Number.isFinite(createdAtMs) || createdAtMs < startMs) return sum;
        return sum + Number(r.commission_base || 0);
      }, 0);

    const data: CommissionSummary = {
      effectiveUserId,
      day: sumSinceMs(dayStartMs),
      week: sumSinceMs(weekStartMs),
      month: sumSinceMs(monthStartMs),
      dayTotal: sumBaseSinceMs(dayStartMs),
      weekTotal: sumBaseSinceMs(weekStartMs),
      monthTotal: sumBaseSinceMs(monthStartMs),
    };

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: msg === "UNAUTHORIZED" ? "unauthorized" : "unexpected_error", message: msg },
      { status }
    );
  }
}

