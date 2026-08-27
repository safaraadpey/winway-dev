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

async function loadProfilesWithCounts(supabase: any) {
  const { data: profileRows, error: profilesError } = await supabase
    .from("dev_player_profiles")
    .select("*")
    .order("name", { ascending: true });

  if (profilesError) throw profilesError;

  const profileIds = (profileRows ?? []).map((row: any) => String(row.id));
  const memberCountByProfile = new Map<string, number>();

  if (profileIds.length > 0) {
    const { data: memberRows, error: membersError } = await supabase
      .from("dev_player_profile_members")
      .select("profile_id")
      .in("profile_id", profileIds);

    if (membersError) throw membersError;

    for (const row of memberRows ?? []) {
      const profileId = String(row.profile_id);
      memberCountByProfile.set(profileId, (memberCountByProfile.get(profileId) ?? 0) + 1);
    }
  }

  return (profileRows ?? []).map((row: any) =>
    mapProfileRow(row, memberCountByProfile.get(String(row.id)) ?? 0)
  );
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

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await getDevPanelContextOrThrow(request);
    const profiles = await loadProfilesWithCounts(supabase);
    console.log(`${LOG_PREFIX} Loaded profiles`, { count: profiles.length });
    return NextResponse.json({ ok: true, data: profiles });
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

    console.error(`${LOG_PREFIX} GET /api/dev-panel/profiles error:`, err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, supabase } = await getDevPanelContextOrThrow(request);
    const body = await request.json();
    const validated = validateProfilePayload(body);

    if (!validated.ok) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: validated.message },
        { status: 400 }
      );
    }

    const memberUserIds = normalizeMemberUserIds(body?.member_user_ids);
    const presetId = String(body?.id || "").trim();

    const profilePayload = {
      name: validated.name,
      play_windows: validated.playWindows,
      allowed_prices: validated.allowedPrices,
      updated_by: session.user.id,
    };

    let savedProfile: any;

    if (presetId) {
      const { data, error } = await supabase
        .from("dev_player_profiles")
        .update(profilePayload)
        .eq("id", presetId)
        .select("*")
        .single();

      if (error) {
        console.error(`${LOG_PREFIX} profile update error:`, error);
        return NextResponse.json(
          { ok: false, error: "database_error", message: error.message },
          { status: 500 }
        );
      }
      savedProfile = data;
    } else {
      const { data, error } = await supabase
        .from("dev_player_profiles")
        .insert({ ...profilePayload, created_by: session.user.id })
        .select("*")
        .single();

      if (error) {
        console.error(`${LOG_PREFIX} profile insert error:`, error);
        return NextResponse.json(
          { ok: false, error: "database_error", message: error.message },
          { status: 500 }
        );
      }
      savedProfile = data;
    }

    await saveProfileMembers(supabase, savedProfile.id, memberUserIds);
    await syncDevPlayerConfigFlags(supabase, session.user.id);

    const { count, error: countError } = await supabase
      .from("dev_player_profile_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("profile_id", savedProfile.id);

    if (countError) throw countError;

    await logAdminAction(
      supabase,
      session.user.id,
      presetId ? "dev_panel_update_profile" : "dev_panel_create_profile",
      "dev_player_profiles",
      savedProfile.id,
      {
        name: validated.name,
        member_count: count ?? memberUserIds.length,
      },
      request
    );

    console.log(`${LOG_PREFIX} Saved profile`, {
      profileId: savedProfile.id,
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

    console.error(`${LOG_PREFIX} POST /api/dev-panel/profiles error:`, err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
