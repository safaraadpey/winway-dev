import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[DevPlayer]";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await getDevPanelContextOrThrow(request);
    const { searchParams } = new URL(request.url);
    const operatorId = (searchParams.get("operatorId") || "").trim();
    const profileId = (searchParams.get("profileId") || "").trim();

    if (!operatorId) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "operatorId is required" },
        { status: 400 }
      );
    }

    const { data: operator, error: operatorError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", operatorId)
      .maybeSingle();

    if (operatorError) throw operatorError;

    if (!operator || (operator.role !== "super" && operator.role !== "agent")) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "operator must be super or agent" },
        { status: 400 }
      );
    }

    const assignedUserIds = new Set<string>();
    if (profileId) {
      const { data: assignedRows, error: assignedError } = await supabase
        .from("dev_player_profile_members")
        .select("user_id")
        .eq("profile_id", profileId);

      if (assignedError) throw assignedError;

      for (const row of assignedRows ?? []) {
        assignedUserIds.add(String(row.user_id));
      }
    }

    const { data: affiliationRows, error: affiliationError } = await supabase
      .from("player_affiliation")
      .select("user_id, agent_id, super_id");

    if (affiliationError) throw affiliationError;

    const playerIds = new Set<string>();

    for (const row of affiliationRows ?? []) {
      const userId = String(row.user_id);
      if (operator.role === "agent" && String(row.agent_id) === operatorId) {
        playerIds.add(userId);
      }
      if (operator.role === "super" && String(row.super_id) === operatorId) {
        playerIds.add(userId);
      }
    }

    if (operator.role === "super") {
      const { data: directChildren, error: childrenError } = await supabase
        .from("users")
        .select("id, role, parent_id")
        .eq("parent_id", operatorId)
        .eq("role", "player");

      if (childrenError) throw childrenError;

      for (const child of directChildren ?? []) {
        playerIds.add(String(child.id));
      }
    }

    if (operator.role === "agent") {
      const { data: directChildren, error: childrenError } = await supabase
        .from("users")
        .select("id, role, parent_id")
        .eq("parent_id", operatorId)
        .eq("role", "player");

      if (childrenError) throw childrenError;

      for (const child of directChildren ?? []) {
        playerIds.add(String(child.id));
      }
    }

    for (const userId of assignedUserIds) {
      playerIds.add(userId);
    }

    const playerIdList = Array.from(playerIds);
    if (playerIdList.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const [{ data: users }, { data: profiles }] = await Promise.all([
      supabase
        .from("users")
        .select("id, username, role, status")
        .in("id", playerIdList)
        .eq("role", "player")
        .eq("status", "active"),
      supabase.from("user_profiles").select("user_id, nickname").in("user_id", playerIdList),
    ]);

    const profilesMap = new Map<string, string>();
    for (const profile of profiles ?? []) {
      if (profile.nickname) {
        profilesMap.set(profile.user_id, profile.nickname);
      }
    }

    const players = (users ?? [])
      .map((user: any) => {
        const nickname = profilesMap.get(user.id) ?? null;
        const username = user.username || "نامشخص";
        return {
          userId: user.id,
          username,
          nickname,
          displayName: nickname?.trim() || username,
          isAssigned: assignedUserIds.has(String(user.id)),
        };
      })
      .sort((a: { isAssigned: boolean; displayName: string }, b: { isAssigned: boolean; displayName: string }) => {
        if (a.isAssigned !== b.isAssigned) {
          return a.isAssigned ? -1 : 1;
        }
        return a.displayName.localeCompare(b.displayName, "fa");
      });

    console.log(`${LOG_PREFIX} Loaded profile players`, {
      operatorId,
      profileId: profileId || null,
      count: players.length,
    });

    return NextResponse.json({ ok: true, data: players });
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

    console.error(`${LOG_PREFIX} GET /api/dev-panel/profiles/players error:`, err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
