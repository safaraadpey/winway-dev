/**
 * Admin tournament mutations API — create.
 *
 * POST /api/admin/tournaments
 *
 * Auth model:
 * - Verify Bearer JWT once (getAdminJwtContextOrThrow).
 * - Re-load role+status from public.users via service_role (canonical SoR).
 * - Allow ONLY roles already enforced by tournament.fn_admin_* SQL: admin|super + status=active.
 * - Execute RPC with the SAME user JWT so auth.uid() inside tournament.fn_admin_* matches the actor.
 *   (Pure service_role RPC would make auth.uid() NULL → UNAUTHORIZED; SQL bodies must not change.)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createServiceClient,
  createUserClientFromAccessToken,
  getAdminJwtContextOrThrow,
  logAdminAction,
} from "@/lib/supabaseServer";

const TOURNAMENT_ADMIN_ROLES = new Set(["admin", "super"]);

function mapRpcError(message: string): { status: number; error: string; message: string } {
  const msg = (message || "").toLowerCase();
  if (msg.includes("unauthorized")) {
    return { status: 401, error: "unauthorized", message: "خطا در احراز هویت" };
  }
  if (msg.includes("forbidden")) {
    return { status: 403, error: "forbidden", message: "شما دسترسی لازم برای این عملیات را ندارید" };
  }
  if (
    msg.includes("invalid") ||
    msg.includes("must be") ||
    msg.includes("require") ||
    msg.includes("not allowed")
  ) {
    return { status: 400, error: "validation_error", message: message || "ورودی نامعتبر است" };
  }
  return {
    status: 500,
    error: "database_error",
    message: "خطا در ایجاد تورنومنت",
  };
}

export async function POST(request: NextRequest) {
  try {
    let ctx;
    try {
      ctx = await getAdminJwtContextOrThrow(request);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "UNAUTHORIZED" || msg.toLowerCase().includes("unauthorized")) {
        return NextResponse.json(
          { ok: false, error: "unauthorized", message: "احراز هویت لازم است." },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی مجاز نیست." },
        { status: 403 }
      );
    }

    const service = createServiceClient();
    const { data: actor, error: actorError } = await service
      .from("users")
      .select("id, role, status")
      .eq("id", ctx.user.id)
      .maybeSingle();

    if (actorError || !actor) {
      console.error("[TournamentAdmin] actor lookup failed", {
        actorId: ctx.user.id,
        error: actorError?.message,
      });
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی مجاز نیست." },
        { status: 403 }
      );
    }

    if (!TOURNAMENT_ADMIN_ROLES.has(String(actor.role)) || actor.status !== "active") {
      return NextResponse.json(
        {
          ok: false,
          error: "forbidden",
          message: "فقط ادمین/سوپر فعال می‌توانند تورنومنت ایجاد کنند.",
        },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid_json", message: "فرمت درخواست نامعتبر است." },
        { status: 400 }
      );
    }

    const payload =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      "payload" in body &&
      (body as { payload: unknown }).payload &&
      typeof (body as { payload: unknown }).payload === "object"
        ? (body as { payload: Record<string, unknown> }).payload
        : body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : null;

    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", message: "بدنه درخواست نامعتبر است." },
        { status: 400 }
      );
    }

    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    if (!title) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "عنوان تورنومنت الزامی است." },
        { status: 400 }
      );
    }

    const userClient = createUserClientFromAccessToken(ctx.accessToken);
    const { data, error } = await userClient.rpc("fn_admin_create_tournament", {
      p_payload: payload,
    });

    if (error) {
      console.error("[TournamentAdmin] create rpc error", {
        actorId: ctx.user.id,
        code: error.code,
        message: error.message,
      });
      const mapped = mapRpcError(error.message || "");
      return NextResponse.json(
        { ok: false, error: mapped.error, message: mapped.message },
        { status: mapped.status }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    const tournamentId =
      row && typeof row === "object" && "id" in row
        ? String((row as { id: unknown }).id ?? "")
        : null;

    await logAdminAction(
      service,
      ctx.user.id,
      "tournament_create",
      "tournaments",
      tournamentId,
      {
        title,
        status: typeof payload.status === "string" ? payload.status : null,
      },
      request
    );

    console.info("[TournamentAdmin] create ok", {
      actorId: ctx.user.id,
      role: actor.role,
      tournamentId,
    });

    return NextResponse.json({ ok: true, data: row }, { status: 201 });
  } catch (err) {
    console.error("[TournamentAdmin] create unexpected", err);
    return NextResponse.json(
      { ok: false, error: "internal_error", message: "خطای داخلی سرور" },
      { status: 500 }
    );
  }
}
