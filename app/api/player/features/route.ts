import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { getUserFeatures } from "@/lib/featureFlags/evaluator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    const features = await getUserFeatures(user.id, { fresh: true });

    return NextResponse.json({
      ok: true,
      data: {
        features,
        evaluatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[Feature] GET /api/player/features error:", err);
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
