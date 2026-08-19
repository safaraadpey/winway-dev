import { NextRequest, NextResponse } from "next/server";
import {
  logAdminAction,
  mapAdminApiError,
  requireAdminZeroContext,
} from "@/lib/featureFlags/adminApiHelpers";
import { invalidateUserFeatures } from "@/lib/featureFlags/evaluator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadFeatureOr404(
  supabase: Awaited<ReturnType<typeof requireAdminZeroContext>>["supabase"],
  featureId: string
) {
  const { data, error } = await supabase
    .from("features")
    .select("id, key, name")
    .eq("id", featureId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function GET(
  request: NextRequest,
  context: { params: { featureId: string } }
) {
  try {
    const { supabase } = await requireAdminZeroContext(request);
    const featureId = context.params.featureId;
    const feature = await loadFeatureOr404(supabase, featureId);

    if (!feature) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "Feature not found." },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();

    const { data: overrideRows, error: overrideError } = await supabase
      .from("feature_user_overrides")
      .select("user_id, is_enabled, expires_at, note, created_at, updated_at")
      .eq("feature_id", featureId)
      .order("updated_at", { ascending: false });

    if (overrideError) {
      throw overrideError;
    }

    const assignedUserIds = (overrideRows || []).map((row) => row.user_id as string);
    const profilesMap = new Map<string, string>();
    const usersMap = new Map<string, { username: string; role: string; status: string }>();

    const lookupIds = new Set<string>(assignedUserIds);

    let searchResults: Array<{
      id: string;
      username: string;
      nickname: string | null;
      displayName: string;
      role: string;
      status: string;
    }> = [];
    let searchUsers: Array<{
      id: string;
      username: string | null;
      role: string;
      status: string;
    }> = [];

    if (search) {
      let searchQuery = supabase
        .from("users")
        .select("id, username, role, status")
        .order("created_at", { ascending: false })
        .limit(20);

      if (/^[0-9a-f-]{36}$/i.test(search)) {
        searchQuery = searchQuery.eq("id", search);
      } else {
        searchQuery = searchQuery.ilike("username", `%${search}%`);
      }

      const { data, error: searchError } = await searchQuery;
      if (searchError) {
        throw searchError;
      }

      searchUsers = data || [];
      for (const user of searchUsers) {
        lookupIds.add(user.id);
      }
    }

    if (lookupIds.size > 0) {
      const ids = Array.from(lookupIds);
      const [{ data: usersData }, { data: profilesData }] = await Promise.all([
        supabase.from("users").select("id, username, role, status").in("id", ids),
        supabase.from("user_profiles").select("user_id, nickname").in("user_id", ids),
      ]);

      for (const profile of profilesData || []) {
        if (profile.nickname) {
          profilesMap.set(profile.user_id, profile.nickname);
        }
      }

      for (const user of usersData || []) {
        usersMap.set(user.id, {
          username: user.username,
          role: user.role,
          status: user.status,
        });
      }
    }

    if (search) {
      searchResults = searchUsers.map((user) => ({
        id: user.id,
        username: user.username || "unknown",
        nickname: profilesMap.get(user.id) ?? null,
        displayName: profilesMap.get(user.id) || user.username || "unknown",
        role: user.role,
        status: user.status,
      }));
    }

    const assignedUsers = (overrideRows || []).map((row) => {
      const userId = row.user_id as string;
      const user = usersMap.get(userId);
      return {
        userId,
        username: user?.username || "unknown",
        nickname: profilesMap.get(userId) ?? null,
        displayName: profilesMap.get(userId) || user?.username || "unknown",
        isEnabled: Boolean(row.is_enabled),
        expiresAt: (row.expires_at as string | null) ?? null,
        note: (row.note as string | null) ?? null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        assignedUsers,
        searchResults,
      },
    });
  } catch (err) {
    console.error("[Feature] GET /api/admin/features/[featureId]/users error:", err);
    return mapAdminApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: { featureId: string } }
) {
  try {
    const { session, supabase } = await requireAdminZeroContext(request);
    const featureId = context.params.featureId;
    const feature = await loadFeatureOr404(supabase, featureId);

    if (!feature) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "Feature not found." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const isEnabled = body?.isEnabled === undefined ? true : Boolean(body.isEnabled);
    const note =
      typeof body?.note === "string" && body.note.trim().length > 0
        ? body.note.trim().slice(0, 500)
        : null;
    const expiresAt =
      typeof body?.expiresAt === "string" && body.expiresAt.trim().length > 0
        ? new Date(body.expiresAt).toISOString()
        : null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "invalid_user", message: "userId is required." },
        { status: 400 }
      );
    }

    const { data: targetUser, error: targetUserError } = await supabase
      .from("users")
      .select("id, username")
      .eq("id", userId)
      .maybeSingle();

    if (targetUserError || !targetUser) {
      return NextResponse.json(
        { ok: false, error: "user_not_found", message: "User not found." },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("feature_user_overrides")
      .upsert(
        {
          feature_id: featureId,
          user_id: userId,
          is_enabled: isEnabled,
          note,
          expires_at: expiresAt,
          created_by: session.user.id,
        },
        { onConflict: "feature_id,user_id" }
      )
      .select("user_id, is_enabled, expires_at, note, created_at, updated_at")
      .single();

    if (error) {
      throw error;
    }

    invalidateUserFeatures(userId);

    await logAdminAction(
      supabase,
      session.user.id,
      "upsert_feature_user_override",
      "feature_user_overrides",
      `${featureId}:${userId}`,
      { featureKey: feature.key, isEnabled },
      request
    );

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("nickname")
      .eq("user_id", userId)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      data: {
        override: {
          userId,
          username: targetUser.username,
          nickname: profile?.nickname ?? null,
          displayName: profile?.nickname || targetUser.username,
          isEnabled: Boolean(data.is_enabled),
          expiresAt: data.expires_at,
          note: data.note,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      },
    });
  } catch (err) {
    console.error("[Feature] POST /api/admin/features/[featureId]/users error:", err);
    return mapAdminApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: { featureId: string } }
) {
  try {
    const { session, supabase } = await requireAdminZeroContext(request);
    const featureId = context.params.featureId;
    const feature = await loadFeatureOr404(supabase, featureId);

    if (!feature) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "Feature not found." },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = (searchParams.get("userId") || "").trim();

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "invalid_user", message: "userId query param is required." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("feature_user_overrides")
      .delete()
      .eq("feature_id", featureId)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    invalidateUserFeatures(userId);

    await logAdminAction(
      supabase,
      session.user.id,
      "remove_feature_user_override",
      "feature_user_overrides",
      `${featureId}:${userId}`,
      { featureKey: feature.key },
      request
    );

    return NextResponse.json({ ok: true, data: { removed: true } });
  } catch (err) {
    console.error("[Feature] DELETE /api/admin/features/[featureId]/users error:", err);
    return mapAdminApiError(err);
  }
}
