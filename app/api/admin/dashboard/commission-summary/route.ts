import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";

type CommissionSummary = {
  effectiveUserId: string;
  day: number;
  week: number;
  month: number;
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

    // Rule: any admin under adminzero (direct child) sees adminzero commission totals.
    // Otherwise, show their own.
    let effectiveUserId = actorId;
    if (adminZeroId) {
      if (actorId === adminZeroId) {
        effectiveUserId = adminZeroId;
      } else if (String((actorUser as any).parent_id ?? "") === String(adminZeroId)) {
        effectiveUserId = adminZeroId;
      }
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

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
    const weekStart = new Date(now.getFullYear(), now.getMonth(), diff).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const sumSince = (startIso: string) =>
      (rows || []).reduce((sum, r: any) => {
        const createdAt = String(r.created_at ?? "");
        if (!createdAt || createdAt < startIso) return sum;
        return sum + Number(r.amount || 0);
      }, 0);

    const data: CommissionSummary = {
      effectiveUserId,
      day: sumSince(dayStart),
      week: sumSince(weekStart),
      month: sumSince(monthStart),
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

