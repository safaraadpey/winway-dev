import { NextRequest, NextResponse } from "next/server";
import {
  logAdminAction,
  mapAdminApiError,
  requireAdminZeroContext,
} from "@/lib/featureFlags/adminApiHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_PATTERN = /^[a-z0-9][a-z0-9_]*[a-z0-9]$/;

type FeatureRecord = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  default_enabled: boolean;
  rollout_percentage: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

async function attachCounts(
  supabase: Awaited<ReturnType<typeof requireAdminZeroContext>>["supabase"],
  features: FeatureRecord[]
) {
  const featureIds = features.map((f) => f.id);
  if (featureIds.length === 0) {
    return [];
  }

  const { data: overrides, error } = await supabase
    .from("feature_user_overrides")
    .select("feature_id, is_enabled, expires_at")
    .in("feature_id", featureIds);

  if (error) {
    throw error;
  }

  const now = Date.now();
  const assignedCountMap = new Map<string, number>();
  const enabledOverrideCountMap = new Map<string, number>();

  for (const row of overrides || []) {
    const featureId = row.feature_id as string;
    assignedCountMap.set(featureId, (assignedCountMap.get(featureId) || 0) + 1);

    const expiresAt = row.expires_at ? new Date(row.expires_at as string).getTime() : null;
    const active = expiresAt === null || expiresAt > now;
    if (active && row.is_enabled === true) {
      enabledOverrideCountMap.set(
        featureId,
        (enabledOverrideCountMap.get(featureId) || 0) + 1
      );
    }
  }

  return features.map((feature) => ({
    ...feature,
    assignedUserCount: assignedCountMap.get(feature.id) || 0,
    enabledOverrideCount: enabledOverrideCountMap.get(feature.id) || 0,
  }));
}

function mapFeature(feature: FeatureRecord & {
  assignedUserCount?: number;
  enabledOverrideCount?: number;
}) {
  return {
    id: feature.id,
    key: feature.key,
    name: feature.name,
    description: feature.description,
    is_enabled: feature.is_enabled,
    default_enabled: feature.default_enabled,
    rollout_percentage: feature.rollout_percentage,
    expires_at: feature.expires_at,
    created_at: feature.created_at,
    updated_at: feature.updated_at,
    assignedUserCount: feature.assignedUserCount ?? 0,
    enabledOverrideCount: feature.enabledOverrideCount ?? 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireAdminZeroContext(request);

    const { data, error } = await supabase
      .from("features")
      .select(
        "id, key, name, description, is_enabled, default_enabled, rollout_percentage, expires_at, created_at, updated_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const withCounts = await attachCounts(supabase, (data || []) as FeatureRecord[]);
    return NextResponse.json({
      ok: true,
      data: {
        features: withCounts.map(mapFeature),
      },
    });
  } catch (err) {
    console.error("[Feature] GET /api/admin/features error:", err);
    return mapAdminApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, supabase } = await requireAdminZeroContext(request);
    const body = await request.json();

    const key = typeof body?.key === "string" ? body.key.trim().toLowerCase() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description =
      typeof body?.description === "string" && body.description.trim().length > 0
        ? body.description.trim().slice(0, 2000)
        : null;

    if (!KEY_PATTERN.test(key)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_key",
          message: "Feature key must use lowercase letters, numbers, and underscores.",
        },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { ok: false, error: "invalid_name", message: "Feature name is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("features")
      .insert({
        key,
        name,
        description,
        created_by: session.user.id,
      })
      .select(
        "id, key, name, description, is_enabled, default_enabled, rollout_percentage, expires_at, created_at, updated_at"
      )
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json(
          { ok: false, error: "duplicate_key", message: "Feature key already exists." },
          { status: 409 }
        );
      }
      throw error;
    }

    await logAdminAction(
      supabase,
      session.user.id,
      "create_feature",
      "features",
      data.id,
      { key, name },
      request
    );

    return NextResponse.json({
      ok: true,
      data: {
        feature: mapFeature({
          ...(data as FeatureRecord),
          assignedUserCount: 0,
          enabledOverrideCount: 0,
        }),
      },
    });
  } catch (err) {
    console.error("[Feature] POST /api/admin/features error:", err);
    return mapAdminApiError(err);
  }
}
