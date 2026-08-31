import { NextRequest, NextResponse } from "next/server";
import { connectPgWithRetry } from "@/lib/db/pgConnect";
import { pgPool } from "@/lib/pg";
import { getDevPanelContextOrThrow, logAdminAction } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[DevPlayer]";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { session, supabase } = await getDevPanelContextOrThrow(request);
    const profileId = params.id;

    if (!profileId) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", message: "profile id is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    if (typeof body?.engine_enabled !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "engine_enabled must be a boolean" },
        { status: 400 }
      );
    }

    const engineEnabled = body.engine_enabled;

    const { data: existing, error: existingError } = await supabase
      .from("dev_player_profiles")
      .select("id, name, engine_enabled")
      .eq("id", profileId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "profile not found" },
        { status: 404 }
      );
    }

    if (Boolean(existing.engine_enabled) === engineEnabled) {
      return NextResponse.json({
        ok: true,
        data: { id: profileId, engineEnabled },
      });
    }

    if (engineEnabled) {
      const client = await connectPgWithRetry(pgPool!);
      try {
        const conflictResult = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM public.dev_player_profile_members m
             JOIN public.leo_user_configs l ON l.user_id = m.user_id
            WHERE m.profile_id = $1
              AND l.is_enabled = true`,
          [profileId]
        );
        const conflictCount = Number(conflictResult.rows[0]?.count ?? 0);
        if (conflictCount > 0) {
          return NextResponse.json(
            {
              ok: false,
              error: "conflict_leo_active",
              message:
                "برخی اعضای این پروفایل لئو فعال دارند. برای روشن کردن Dev Player ابتدا لئو را غیرفعال کنید.",
            },
            { status: 409 }
          );
        }
      } finally {
        client.release();
      }
    }

    const { error: updateError } = await supabase
      .from("dev_player_profiles")
      .update({
        engine_enabled: engineEnabled,
        updated_by: session.user.id,
      })
      .eq("id", profileId);

    if (updateError) {
      console.error(`${LOG_PREFIX} profile engine toggle error:`, updateError);
      return NextResponse.json(
        { ok: false, error: "database_error", message: updateError.message },
        { status: 500 }
      );
    }

    await logAdminAction(
      supabase,
      session.user.id,
      engineEnabled ? "dev_panel_enable_profile_engine" : "dev_panel_disable_profile_engine",
      "dev_player_profiles",
      profileId,
      { name: existing.name, engine_enabled: engineEnabled },
      request
    );

    console.log(`${LOG_PREFIX} Profile engine toggle`, {
      profileId,
      engineEnabled,
    });

    return NextResponse.json({
      ok: true,
      data: { id: profileId, engineEnabled },
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "missing or invalid session" },
        { status: 401 }
      );
    }
    if (err.message === "FORBIDDEN" || err.message === "FORBIDDEN_DEV_PANEL") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "dev panel access required" },
        { status: 403 }
      );
    }

    console.error(`${LOG_PREFIX} PATCH /api/dev-panel/profiles/[id]/engine error:`, err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
