import { NextRequest, NextResponse } from "next/server";
import {
  logAdminAction,
  mapAdminApiError,
  requireAdminZeroContext,
} from "@/lib/featureFlags/adminApiHelpers";
import { clearFeatureCache } from "@/lib/featureFlags/evaluator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function loadFeatureById(
  supabase: Awaited<ReturnType<typeof requireAdminZeroContext>>["supabase"],
  featureId: string
) {
  const { data, error } = await supabase
    .from("features")
    .select(
      "id, key, name, description, is_enabled, default_enabled, rollout_percentage, expires_at, created_at, updated_at"
    )
    .eq("id", featureId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as FeatureRecord | null;
}

async function attachCountsForOne(
  supabase: Awaited<ReturnType<typeof requireAdminZeroContext>>["supabase"],
  feature: FeatureRecord
) {
  const { data: overrides, error } = await supabase
    .from("feature_user_overrides")
    .select("is_enabled, expires_at")
    .eq("feature_id", feature.id);

  if (error) {
    throw error;
  }

  const now = Date.now();
  let assignedUserCount = 0;
  let enabledOverrideCount = 0;

  for (const row of overrides || []) {
    assignedUserCount += 1;
    const expiresAt = row.expires_at ? new Date(row.expires_at as string).getTime() : null;
    const active = expiresAt === null || expiresAt > now;
    if (active && row.is_enabled === true) {
      enabledOverrideCount += 1;
    }
  }

  return mapFeature({
    ...feature,
    assignedUserCount,
    enabledOverrideCount,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: { featureId: string } }
) {
  try {
    const { session, supabase } = await requireAdminZeroContext(request);
    const featureId = context.params.featureId;
    const existing = await loadFeatureById(supabase, featureId);

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "Feature not found." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updatePayload: Record<string, unknown> = {};

    if (typeof body?.name === "string" && body.name.trim()) {
      updatePayload.name = body.name.trim().slice(0, 200);
    }

    if (body?.description === null) {
      updatePayload.description = null;
    } else if (typeof body?.description === "string") {
      updatePayload.description = body.description.trim().slice(0, 2000) || null;
    }

    if (typeof body?.is_enabled === "boolean") {
      updatePayload.is_enabled = body.is_enabled;
    }

    if (typeof body?.default_enabled === "boolean") {
      updatePayload.default_enabled = body.default_enabled;
    }

    if (body?.rollout_percentage !== undefined) {
      const rollout = Number(body.rollout_percentage);
      if (!Number.isFinite(rollout) || rollout < 0 || rollout > 100) {
        return NextResponse.json(
          {
            ok: false,
            error: "invalid_rollout",
            message: "rollout_percentage must be between 0 and 100.",
          },
          { status: 400 }
        );
      }
      updatePayload.rollout_percentage = rollout;
    }

    if (body?.expires_at === null) {
      updatePayload.expires_at = null;
    } else if (typeof body?.expires_at === "string" && body.expires_at.trim()) {
      updatePayload.expires_at = new Date(body.expires_at).toISOString();
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", message: "No valid fields to update." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("features")
      .update(updatePayload)
      .eq("id", featureId)
      .select(
        "id, key, name, description, is_enabled, default_enabled, rollout_percentage, expires_at, created_at, updated_at"
      )
      .single();

    if (error) {
      throw error;
    }

    clearFeatureCache();

    await logAdminAction(
      supabase,
      session.user.id,
      "update_feature",
      "features",
      featureId,
      updatePayload,
      request
    );

    const feature = await attachCountsForOne(supabase, data as FeatureRecord);
    return NextResponse.json({ ok: true, data: { feature } });
  } catch (err) {
    console.error("[Feature] PATCH /api/admin/features/[featureId] error:", err);
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
    const existing = await loadFeatureById(supabase, featureId);

    if (!existing) {
      return NextResponse.json({ ok: true, data: { deleted: true } });
    }

    const { error } = await supabase.from("features").delete().eq("id", featureId);
    if (error) {
      throw error;
    }

    clearFeatureCache();

    await logAdminAction(
      supabase,
      session.user.id,
      "delete_feature",
      "features",
      featureId,
      { key: existing.key },
      request
    );

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    console.error("[Feature] DELETE /api/admin/features/[featureId] error:", err);
    return mapAdminApiError(err);
  }
}
