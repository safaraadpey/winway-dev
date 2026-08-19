import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import {
  assertFeature,
  FeatureDisabledError,
  featureDisabledResponse,
} from "@/lib/featureFlags/requireFeature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_FEATURE_KEY = "sample_beta_badge";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    await assertFeature(user.id, SAMPLE_FEATURE_KEY);

    return NextResponse.json({
      ok: true,
      data: {
        featureKey: SAMPLE_FEATURE_KEY,
        message: "Sample beta feature is enabled for this user.",
        pingAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof FeatureDisabledError) {
      return featureDisabledResponse(err.featureKey);
    }

    console.error("[Feature] GET /api/player/features/sample-beta/ping error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "unexpected_error",
        message: err instanceof Error ? err.message : "unexpected error",
      },
      { status: 500 }
    );
  }
}
