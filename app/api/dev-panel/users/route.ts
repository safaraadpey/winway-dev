import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function makeShortIdFromUuid(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(31, hash) + id.charCodeAt(i);
  }
  const num = (hash >>> 0) % 1_000_000_0000;
  return num.toString().padStart(10, "0");
}

function pickDisplayName(
  userId: string | null | undefined,
  usersMap: Map<string, { username: string | null; role: string }>,
  profilesMap: Map<string, string>
): string | null {
  if (!userId) return null;
  const user = usersMap.get(userId);
  if (!user) return null;
  return profilesMap.get(userId) || user.username || null;
}

function mapDevPlayerConfig(
  row: any | null,
  profileMembershipUserIds: Set<string>
) {
  const userId = row?.user_id ? String(row.user_id) : null;
  const isEnabled = userId ? profileMembershipUserIds.has(userId) : false;

  if (!isEnabled) return null;

  return {
    userId,
    isEnabled: true,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await getDevPanelContextOrThrow(request);
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const roleFilter = searchParams.get("role") || "all";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 200), 1), 500);
    const offset = Math.max(Number(searchParams.get("offset") || 0), 0);

    let query = supabase
      .from("users")
      .select("id, username, role, status, parent_id", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (roleFilter !== "all") {
      query = query.eq("role", roleFilter);
    }

    if (search) {
      query = query.or(`username.ilike.%${search}%,id.eq.${search}`);
    }

    const { data: usersData, error: usersError, count } = await query;

    if (usersError) {
      console.error("dev-panel users list error:", usersError);
      return NextResponse.json(
        { ok: false, error: "database_error", message: usersError.message },
        { status: 500 }
      );
    }

    const userIds = (usersData || []).map((u) => u.id);
    const profilesMap = new Map<string, string>();
    const devPlayerConfigMap = new Map<string, any>();
    const profileMembershipUserIds = new Set<string>();
    const affiliationMap = new Map<
      string,
      { agent_id: string | null; super_id: string | null }
    >();

    if (userIds.length > 0) {
      const [
        { data: profiles },
        { data: devPlayerConfigs },
        { data: affiliations },
        { data: profileMembers },
      ] = await Promise.all([
        supabase.from("user_profiles").select("user_id, nickname").in("user_id", userIds),
        supabase.from("dev_player_configs").select("user_id, updated_at").in("user_id", userIds),
        supabase
          .from("player_affiliation")
          .select("user_id, agent_id, super_id")
          .in("user_id", userIds),
        supabase.from("dev_player_profile_members").select("user_id").in("user_id", userIds),
      ]);

      for (const profile of profiles || []) {
        if (profile.nickname) {
          profilesMap.set(profile.user_id, profile.nickname);
        }
      }

      for (const config of devPlayerConfigs || []) {
        devPlayerConfigMap.set(config.user_id, config);
      }

      for (const row of profileMembers || []) {
        profileMembershipUserIds.add(String(row.user_id));
      }

      for (const row of affiliations || []) {
        affiliationMap.set(row.user_id, {
          agent_id: row.agent_id ?? null,
          super_id: row.super_id ?? null,
        });
      }
    }

    const uplineIds = new Set<string>();
    for (const user of usersData || []) {
      const aff = affiliationMap.get(user.id);
      if (user.role === "player") {
        if (aff?.agent_id) uplineIds.add(aff.agent_id);
        if (aff?.super_id) uplineIds.add(aff.super_id);
        if (!aff?.agent_id && !aff?.super_id && user.parent_id) {
          uplineIds.add(user.parent_id);
        }
      } else if (user.role === "agent" && user.parent_id) {
        uplineIds.add(user.parent_id);
      }
    }

    type UplineUser = {
      username: string | null;
      role: string;
      parent_id: string | null;
    };
    const uplineUsersMap = new Map<string, UplineUser>();

    async function loadUplineUsers(ids: string[]) {
      if (ids.length === 0) return;
      const missingIds = ids.filter((id) => !uplineUsersMap.has(id));
      if (missingIds.length === 0) return;

      const [{ data: uplineUsers }, { data: uplineProfiles }] = await Promise.all([
        supabase
          .from("users")
          .select("id, username, role, parent_id")
          .in("id", missingIds),
        supabase
          .from("user_profiles")
          .select("user_id, nickname")
          .in("user_id", missingIds),
      ]);

      for (const profile of uplineProfiles || []) {
        if (profile.nickname) {
          profilesMap.set(profile.user_id, profile.nickname);
        }
      }

      const parentSuperIds: string[] = [];
      for (const uplineUser of uplineUsers || []) {
        uplineUsersMap.set(uplineUser.id, {
          username: uplineUser.username,
          role: uplineUser.role,
          parent_id: uplineUser.parent_id ?? null,
        });
        if (
          uplineUser.role === "agent" &&
          uplineUser.parent_id &&
          !uplineUsersMap.has(uplineUser.parent_id)
        ) {
          parentSuperIds.push(uplineUser.parent_id);
        }
      }

      if (parentSuperIds.length > 0) {
        await loadUplineUsers(parentSuperIds);
      }
    }

    await loadUplineUsers(Array.from(uplineIds));

    const users = (usersData || []).map((user) => {
      const aff = affiliationMap.get(user.id);
      let agentId: string | null = null;
      let superId: string | null = null;

      if (user.role === "player") {
        agentId = aff?.agent_id ?? null;
        superId = aff?.super_id ?? null;

        if (!agentId && !superId && user.parent_id) {
          const parent = uplineUsersMap.get(user.parent_id);
          if (parent?.role === "agent") {
            agentId = user.parent_id;
          } else if (parent?.role === "super") {
            superId = user.parent_id;
          }
        }

        if (agentId && !superId) {
          const agent = uplineUsersMap.get(agentId);
          if (agent?.parent_id) {
            const agentParent = uplineUsersMap.get(agent.parent_id);
            if (agentParent?.role === "super") {
              superId = agent.parent_id;
            }
          }
        }
      } else if (user.role === "agent" && user.parent_id) {
        const parent = uplineUsersMap.get(user.parent_id);
        if (parent?.role === "super") {
          superId = user.parent_id;
        }
      }

      return {
        id: user.id,
        shortId: makeShortIdFromUuid(user.id),
        username: user.username || "نامشخص",
        nickname: profilesMap.get(user.id) ?? null,
        displayName: profilesMap.get(user.id) || user.username || "نامشخص",
        role: user.role,
        status: user.status,
        agentName: pickDisplayName(agentId, uplineUsersMap, profilesMap),
        superName: pickDisplayName(superId, uplineUsersMap, profilesMap),
        devPlayerConfig: mapDevPlayerConfig(
          devPlayerConfigMap.get(user.id) || null,
          profileMembershipUserIds
        ),
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        users,
        totalCount: count ?? users.length,
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

    console.error("GET /api/dev-panel/users error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
