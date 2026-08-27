import { NextRequest, NextResponse } from "next/server";
import { syncDevPlayerConfigFlags } from "@/lib/dev-panel/devPlayerProfileSync";
import {
  mapDevPlayerProfileRow,
  normalizeMemberUserIds,
  validateProfilePayload,
} from "@/lib/dev-panel/devPlayerProfileValidation";
import { getDevPanelContextOrThrow, logAdminAction } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[DevPlayer]";

function mapProfileRow(row: any, memberCount: number) {
  return mapDevPlayerProfileRow(row as Record<string, unknown>, memberCount);
}

async function saveProfileMembers(
  supabase: any,
  profileId: string,
  memberUserIds: string[]
) {
  const { error: deleteError } = await supabase
    .from("dev_player_profile_members")
    .delete()
    .eq("profile_id", profileId);

  if (deleteError) throw deleteError;

  if (memberUserIds.length === 0) return;

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, role")
    .in("id", memberUserIds);

  if (usersError) throw usersError;

  const validUserIds = (users ?? [])
    .filter((user: { role: string }) => user.role === "player")
    .map((user: { id: string }) => String(user.id));

  if (validUserIds.length === 0) return;

  const { error: insertError } = await supabase.from("dev_player_profile_members").insert(
    validUserIds.map((userId: string) => ({
      profile_id: profileId,
      user_id: userId,
    }))
  );

  if (insertError) throw insertError;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase } = await getDevPanelContextOrThrow(_request);
    const profileId = params.id;

    if (!profileId) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", message: "profile id is required" },
        { status: 400 }
      );
    }

    const { data: profileRow, error: profileError } = await supabase
      .from("dev_player_profiles")
      .select("*")
      .eq("id", profileId)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profileRow) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "profile not found" },
        { status: 404 }
      );
    }

    const { data: memberRows, error: membersError } = await supabase
      .from("dev_player_profile_members")
      .select("user_id")
      .eq("profile_id", profileId);

    if (membersError) throw membersError;

    const memberUserIds = (memberRows ?? []).map((row: { user_id: string }) => String(row.user_id));

    return NextResponse.json({
      ok: true,
      data: {
        ...mapProfileRow(profileRow, memberUserIds.length),
        memberUserIds,
      },
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

    console.error(`${LOG_PREFIX} GET /api/dev-panel/profiles/[id] error:`, err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}

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
    const validated = validateProfilePayload(body);

    if (!validated.ok) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: validated.message },
        { status: 400 }
      );
    }

    const memberUserIds = normalizeMemberUserIds(body?.member_user_ids);

    const { data: savedProfile, error } = await supabase
      .from("dev_player_profiles")
      .update({
        name: validated.name,
        play_windows: validated.playWindows,
        allowed_prices: validated.allowedPrices,
        updated_by: session.user.id,
      })
      .eq("id", profileId)
      .select("*")
      .single();

    if (error || !savedProfile) {
      console.error(`${LOG_PREFIX} profile update error:`, error);
      return NextResponse.json(
        {
          ok: false,
          error: error ? "database_error" : "not_found",
          message: error?.message || "profile not found",
        },
        { status: error ? 500 : 404 }
      );
    }

    await saveProfileMembers(supabase, profileId, memberUserIds);
    await syncDevPlayerConfigFlags(supabase, session.user.id);

    const { count, error: countError } = await supabase
      .from("dev_player_profile_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("profile_id", profileId);

    if (countError) throw countError;

    await logAdminAction(
      supabase,
      session.user.id,
      "dev_panel_update_profile",
      "dev_player_profiles",
      profileId,
      {
        name: validated.name,
        member_count: count ?? memberUserIds.length,
      },
      request
    );

    console.log(`${LOG_PREFIX} Updated profile`, {
      profileId,
      memberCount: count ?? memberUserIds.length,
    });

    return NextResponse.json({
      ok: true,
      data: mapProfileRow(savedProfile, count ?? memberUserIds.length),
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

    console.error(`${LOG_PREFIX} PATCH /api/dev-panel/profiles/[id] error:`, err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const { data: existing, error: existingError } = await supabase
      .from("dev_player_profiles")
      .select("id, name")
      .eq("id", profileId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "profile not found" },
        { status: 404 }
      );
    }

    const { error: deleteError } = await supabase
      .from("dev_player_profiles")
      .delete()
      .eq("id", profileId);

    if (deleteError) {
      console.error(`${LOG_PREFIX} profile delete error:`, deleteError);
      return NextResponse.json(
        { ok: false, error: "database_error", message: deleteError.message },
        { status: 500 }
      );
    }

    await syncDevPlayerConfigFlags(supabase, session.user.id);

    await logAdminAction(
      supabase,
      session.user.id,
      "dev_panel_delete_profile",
      "dev_player_profiles",
      profileId,
      { name: existing.name },
      request
    );

    console.log(`${LOG_PREFIX} Deleted profile`, { profileId });

    return NextResponse.json({ ok: true, data: { deleted: true } });
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

    console.error(`${LOG_PREFIX} DELETE /api/dev-panel/profiles/[id] error:`, err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
