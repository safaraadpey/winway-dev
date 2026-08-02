/**
 * Admin tournament mutations API — update / delete.
 *
 * PATCH  /api/admin/tournaments/[id]
 * DELETE /api/admin/tournaments/[id]
 *
 * Auth: same as POST /api/admin/tournaments — admin|super + active from public.users;
 * RPC executed with caller JWT so tournament.fn_admin_* auth.uid() works.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createServiceClient,
  createUserClientFromAccessToken,
  getAdminJwtContextOrThrow,
  logAdminAction,
} from "@/lib/supabaseServer";

const TOURNAMENT_ADMIN_ROLES = new Set(["admin", "super"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapRpcError(
  message: string,
  fallbackMessage: string
): { status: number; error: string; message: string } {
  const msg = (message || "").toLowerCase();
  if (msg.includes("unauthorized")) {
    return { status: 401, error: "unauthorized", message: "خطا در احراز هویت" };
  }
  if (msg.includes("forbidden")) {
    return { status: 403, error: "forbidden", message: "شما دسترسی لازم برای این عملیات را ندارید" };
  }
  if (msg.includes("not found") || msg.includes("does not exist")) {
    return { status: 404, error: "not_found", message: "تورنومنت یافت نشد" };
  }
  if (
    msg.includes("invalid") ||
    msg.includes("must be") ||
    msg.includes("require") ||
    msg.includes("not allowed") ||
    msg.includes("cannot") ||
    msg.includes("locked")
  ) {
    return { status: 400, error: "validation_error", message: message || "ورودی نامعتبر است" };
  }
  return {
    status: 500,
    error: "database_error",
    message: fallbackMessage,
  };
}

async function requireTournamentAdmin(request: NextRequest) {
  let ctx;
  try {
    ctx = await getAdminJwtContextOrThrow(request);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHORIZED" || msg.toLowerCase().includes("unauthorized")) {
      return {
        error: NextResponse.json(
          { ok: false, error: "unauthorized", message: "احراز هویت لازم است." },
          { status: 401 }
        ),
      };
    }
    return {
      error: NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی مجاز نیست." },
        { status: 403 }
      ),
    };
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
    return {
      error: NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی مجاز نیست." },
        { status: 403 }
      ),
    };
  }

  if (!TOURNAMENT_ADMIN_ROLES.has(String(actor.role)) || actor.status !== "active") {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error: "forbidden",
          message: "فقط ادمین/سوپر فعال می‌توانند این عملیات را انجام دهند.",
        },
        { status: 403 }
      ),
    };
  }

  return { ctx, service, actor };
}

function parseTournamentId(raw: string | undefined): string | null {
  if (!raw || !UUID_RE.test(raw)) return null;
  return raw;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireTournamentAdmin(request);
    if ("error" in auth && auth.error) return auth.error;
    const { ctx, service, actor } = auth as {
      ctx: Awaited<ReturnType<typeof getAdminJwtContextOrThrow>>;
      service: ReturnType<typeof createServiceClient>;
      actor: { id: string; role: string; status: string };
    };

    const tournamentId = parseTournamentId(params.id);
    if (!tournamentId) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "شناسه تورنومنت نامعتبر است." },
        { status: 400 }
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

    const patch =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      "patch" in body &&
      (body as { patch: unknown }).patch &&
      typeof (body as { patch: unknown }).patch === "object" &&
      !Array.isArray((body as { patch: unknown }).patch)
        ? ((body as { patch: Record<string, unknown> }).patch)
        : body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : null;

    if (!patch || Object.keys(patch).length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "بدنه به‌روزرسانی خالی یا نامعتبر است.",
        },
        { status: 400 }
      );
    }

    const userClient = createUserClientFromAccessToken(ctx.accessToken);
    const { data, error } = await userClient.rpc("fn_admin_update_tournament", {
      p_tournament_id: tournamentId,
      p_patch: patch,
    });

    if (error) {
      console.error("[TournamentAdmin] update rpc error", {
        actorId: ctx.user.id,
        tournamentId,
        code: error.code,
        message: error.message,
      });
      const mapped = mapRpcError(error.message || "", "خطا در به‌روزرسانی تورنومنت");
      return NextResponse.json(
        { ok: false, error: mapped.error, message: mapped.message },
        { status: mapped.status }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;

    await logAdminAction(
      service,
      ctx.user.id,
      "tournament_update",
      "tournaments",
      tournamentId,
      { patch_keys: Object.keys(patch) },
      request
    );

    console.info("[TournamentAdmin] update ok", {
      actorId: ctx.user.id,
      role: actor.role,
      tournamentId,
    });

    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    console.error("[TournamentAdmin] update unexpected", err);
    return NextResponse.json(
      { ok: false, error: "internal_error", message: "خطای داخلی سرور" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireTournamentAdmin(request);
    if ("error" in auth && auth.error) return auth.error;
    const { ctx, service, actor } = auth as {
      ctx: Awaited<ReturnType<typeof getAdminJwtContextOrThrow>>;
      service: ReturnType<typeof createServiceClient>;
      actor: { id: string; role: string; status: string };
    };

    const tournamentId = parseTournamentId(params.id);
    if (!tournamentId) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "شناسه تورنومنت نامعتبر است." },
        { status: 400 }
      );
    }

    const userClient = createUserClientFromAccessToken(ctx.accessToken);
    const { data, error } = await userClient.rpc("fn_admin_delete_tournament", {
      p_tournament_id: tournamentId,
    });

    if (error) {
      console.error("[TournamentAdmin] delete rpc error", {
        actorId: ctx.user.id,
        tournamentId,
        code: error.code,
        message: error.message,
      });
      const mapped = mapRpcError(error.message || "", "خطا در حذف تورنومنت");
      return NextResponse.json(
        { ok: false, error: mapped.error, message: mapped.message },
        { status: mapped.status }
      );
    }

    await logAdminAction(
      service,
      ctx.user.id,
      "tournament_delete",
      "tournaments",
      tournamentId,
      {},
      request
    );

    console.info("[TournamentAdmin] delete ok", {
      actorId: ctx.user.id,
      role: actor.role,
      tournamentId,
    });

    return NextResponse.json({ ok: true, data: data ?? null });
  } catch (err) {
    console.error("[TournamentAdmin] delete unexpected", err);
    return NextResponse.json(
      { ok: false, error: "internal_error", message: "خطای داخلی سرور" },
      { status: 500 }
    );
  }
}
