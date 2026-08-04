/**
 * API Route: تنظیم درصد کانیات (commission) برای agent/super
 *
 * POST /api/admin/users/set-commission
 *
 * امنیت:
 * - از service_role استفاده می‌کند (RLS bypass)
 * - اما دسترسی را بر اساس نقش caller محدود می‌کند
 *   - super: فقط برای agent های مستقیم خودش
 *   - agent: فقط برای agent های مستقیم خودش
 *   - admin (هر subrole): فقط برای super/agent های مستقیم خودش
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow, logAdminAction } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);

    const body = await request.json();
    const { user_id, commission_percent } = body ?? {};

    if (!user_id || commission_percent === undefined || commission_percent === null) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", message: "user_id and commission_percent are required" },
        { status: 400 }
      );
    }

    const commissionPercent = Number(commission_percent);
    if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "commission_percent must be between 0 and 100" },
        { status: 400 }
      );
    }

    const decimal = commissionPercent / 100;

    // Prevent self-modification to reduce privilege accidents.
    if (user_id === session.user.id) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "cannot modify your own commission percent" },
        { status: 403 }
      );
    }

    const { data: targetUser, error: targetErr } = await supabase
      .from("users")
      .select("id, role, parent_id")
      .eq("id", user_id)
      .single();

    if (targetErr || !targetUser) {
      return NextResponse.json(
        { ok: false, error: "user_not_found", message: "target user not found" },
        { status: 404 }
      );
    }

    const targetRole = String((targetUser as any).role ?? "");
    const targetParentId = (targetUser as any).parent_id as string | null;

    if (targetRole !== "agent" && targetRole !== "super") {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "commission can only be set for agent or super" },
        { status: 400 }
      );
    }

    // Authorization rules (as requested):
    // - super → agents directly under that super
    // - agent → agents directly under that agent
    // - admin (any subrole) → if under adminzero, can edit any agent/super under adminzero
    //   otherwise only direct agents and supers under that admin
    const actorRole = session.role;
    const actorId = session.user.id;
    const { data: actorUser, error: actorUserErr } = await supabase
      .from("users")
      .select("id, parent_id")
      .eq("id", actorId)
      .single();

    if (actorUserErr || !actorUser) {
      return NextResponse.json(
        { ok: false, error: "user_not_found", message: "actor user not found" },
        { status: 404 }
      );
    }
    const actorParentId = (actorUser as any).parent_id as string | null;

    const { data: adminZero, error: adminZeroErr } = await supabase
      .from("users")
      .select("id")
      .eq("username", "adminzero")
      .eq("role", "admin")
      .single();

    if (adminZeroErr || !adminZero) {
      return NextResponse.json(
        { ok: false, error: "adminzero_not_found", message: "adminzero user not found" },
        { status: 500 }
      );
    }
    const adminZeroId = (adminZero as any).id as string;
    const isAdminZero = actorId === adminZeroId;
    const isUnderAdminZero = actorParentId === adminZeroId;

    if (actorRole === "super") {
      if (targetRole !== "agent" || targetParentId !== actorId) {
        return NextResponse.json(
          { ok: false, error: "forbidden", message: "super can only set commission for direct agents" },
          { status: 403 }
        );
      }

      // Business rule: a super cannot set an agent's commission above the super's own commission.
      const { data: actorCommission, error: actorCommissionErr } = await supabase
        .from("user_commissions")
        .select("super_commission")
        .eq("user_id", actorId)
        .maybeSingle();

      if (actorCommissionErr) {
        console.error("set-commission: actor commission load error:", actorCommissionErr);
        return NextResponse.json(
          { ok: false, error: "database_error", message: actorCommissionErr.message },
          { status: 500 }
        );
      }

      let actorSuperRate = Number((actorCommission as any)?.super_commission ?? 0);
      if (!Number.isFinite(actorSuperRate) || actorSuperRate < 0) actorSuperRate = 0;
      if (actorSuperRate > 1) actorSuperRate = actorSuperRate / 100; // tolerate legacy percent storage

      if (decimal > actorSuperRate) {
        return NextResponse.json(
          {
            ok: false,
            error: "validation_error",
            message: "agent commission_percent cannot exceed super's own commission_percent",
            max_percent: actorSuperRate * 100,
          },
          { status: 400 }
        );
      }
    } else if (actorRole === "agent") {
      if (targetRole !== "agent" || targetParentId !== actorId) {
        return NextResponse.json(
          { ok: false, error: "forbidden", message: "agent can only set commission for direct agents" },
          { status: 403 }
        );
      }

      // Business rule: an agent cannot set a child agent commission above its own agent commission.
      const { data: actorCommission, error: actorCommissionErr } = await supabase
        .from("user_commissions")
        .select("agent_commission")
        .eq("user_id", actorId)
        .maybeSingle();

      if (actorCommissionErr) {
        console.error("set-commission: actor commission load error:", actorCommissionErr);
        return NextResponse.json(
          { ok: false, error: "database_error", message: actorCommissionErr.message },
          { status: 500 }
        );
      }

      let actorAgentRate = Number((actorCommission as any)?.agent_commission ?? 0);
      if (!Number.isFinite(actorAgentRate) || actorAgentRate < 0) actorAgentRate = 0;
      if (actorAgentRate > 1) actorAgentRate = actorAgentRate / 100; // tolerate legacy percent storage

      if (decimal > actorAgentRate) {
        return NextResponse.json(
          {
            ok: false,
            error: "validation_error",
            message: "agent commission_percent cannot exceed actor agent commission_percent",
            max_percent: actorAgentRate * 100,
          },
          { status: 400 }
        );
      }
    } else if (actorRole === "admin") {
      const adminCanEditUnderAdminZero =
        (isAdminZero || isUnderAdminZero) && targetParentId === adminZeroId;
      const adminCanEditDirect = targetParentId === actorId;

      if (!adminCanEditUnderAdminZero && !adminCanEditDirect) {
        return NextResponse.json(
          { ok: false, error: "forbidden_parent", message: "admin can only set commission for direct users" },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "only admin, super or agent can set commission" },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();

    const updateData: Record<string, any> = {
      updated_at: nowIso,
    };
    if (targetRole === "agent") {
      updateData.agent_commission = decimal;
    } else {
      updateData.super_commission = decimal;
    }

    // Update only the relevant column (do not overwrite the other one).
    const { data: existingRow, error: existingErr } = await supabase
      .from("user_commissions")
      .select("user_id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (existingErr) {
      console.error("set-commission: existing row check error:", existingErr);
      return NextResponse.json(
        { ok: false, error: "database_error", message: existingErr.message },
        { status: 500 }
      );
    }

    if (existingRow?.user_id) {
      const { error: updateErr } = await supabase
        .from("user_commissions")
        .update(updateData)
        .eq("user_id", user_id);

      if (updateErr) {
        console.error("set-commission: update error:", updateErr);
        return NextResponse.json(
          { ok: false, error: "database_error", message: updateErr.message },
          { status: 500 }
        );
      }
    } else {
      const { error: insertErr } = await supabase
        .from("user_commissions")
        .insert({
          user_id,
          created_at: nowIso,
          ...updateData,
        });

      if (insertErr) {
        console.error("set-commission: insert error:", insertErr);
        return NextResponse.json(
          { ok: false, error: "database_error", message: insertErr.message },
          { status: 500 }
        );
      }
    }

    // Audit log (best-effort)
    try {
      await logAdminAction(
        supabase,
        actorId,
        "set_user_commission_percent",
        "user_commissions",
        user_id,
        {
          actor_role: actorRole,
          target_role: targetRole,
          commission_percent: commissionPercent,
        },
        request
      );
    } catch (auditErr) {
      console.warn("set-commission: audit log failed:", auditErr);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "missing or invalid session" },
        { status: 401 }
      );
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "insufficient permissions" },
        { status: 403 }
      );
    }

    console.error("POST /api/admin/users/set-commission error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);
    const userId = request.nextUrl.searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", message: "user_id is required" },
        { status: 400 }
      );
    }

    const { data: targetUser, error: targetErr } = await supabase
      .from("users")
      .select("id, role, parent_id")
      .eq("id", userId)
      .single();

    if (targetErr || !targetUser) {
      return NextResponse.json(
        { ok: false, error: "user_not_found", message: "target user not found" },
        { status: 404 }
      );
    }

    const targetRole = String((targetUser as any).role ?? "");
    const targetParentId = (targetUser as any).parent_id as string | null;

    if (targetRole !== "agent" && targetRole !== "super") {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "commission is only available for agent or super" },
        { status: 400 }
      );
    }

    const actorRole = session.role;
    const actorId = session.user.id;

    const { data: actorUser, error: actorUserErr } = await supabase
      .from("users")
      .select("id, parent_id")
      .eq("id", actorId)
      .single();

    if (actorUserErr || !actorUser) {
      return NextResponse.json(
        { ok: false, error: "user_not_found", message: "actor user not found" },
        { status: 404 }
      );
    }
    const actorParentId = (actorUser as any).parent_id as string | null;

    const { data: adminZero, error: adminZeroErr } = await supabase
      .from("users")
      .select("id")
      .eq("username", "adminzero")
      .eq("role", "admin")
      .single();

    if (adminZeroErr || !adminZero) {
      return NextResponse.json(
        { ok: false, error: "adminzero_not_found", message: "adminzero user not found" },
        { status: 500 }
      );
    }
    const adminZeroId = (adminZero as any).id as string;
    const isAdminZero = actorId === adminZeroId;
    const isUnderAdminZero = actorParentId === adminZeroId;

    if (actorRole === "super") {
      if (targetRole !== "agent" || targetParentId !== actorId) {
        return NextResponse.json(
          { ok: false, error: "forbidden", message: "super can only view commission for direct agents" },
          { status: 403 }
        );
      }
    } else if (actorRole === "agent") {
      if (targetRole !== "agent" || targetParentId !== actorId) {
        return NextResponse.json(
          { ok: false, error: "forbidden", message: "agent can only view commission for direct agents" },
          { status: 403 }
        );
      }
    } else if (actorRole === "admin") {
      const adminCanViewUnderAdminZero =
        (isAdminZero || isUnderAdminZero) && targetParentId === adminZeroId;
      const adminCanViewDirect = targetParentId === actorId;

      if (!adminCanViewUnderAdminZero && !adminCanViewDirect) {
        return NextResponse.json(
          { ok: false, error: "forbidden_parent", message: "admin can only view commission for direct users" },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "only admin, super or agent can view commission" },
        { status: 403 }
      );
    }

    const { data: row, error: rowErr } = await supabase
      .from("user_commissions")
      .select("agent_commission, super_commission")
      .eq("user_id", userId)
      .maybeSingle();

    if (rowErr) {
      return NextResponse.json(
        { ok: false, error: "database_error", message: rowErr.message },
        { status: 500 }
      );
    }

    const raw = targetRole === "agent" ? (row as any)?.agent_commission : (row as any)?.super_commission;
    let commissionPercent: number | null = null;
    if (raw !== null && raw !== undefined) {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        commissionPercent = n > 1 ? n : n * 100;
      }
    }

    return NextResponse.json(
      { ok: true, data: { commission_percent: commissionPercent } },
      { status: 200 }
    );
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "missing or invalid session" },
        { status: 401 }
      );
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "insufficient permissions" },
        { status: 403 }
      );
    }

    console.error("GET /api/admin/users/set-commission error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}

