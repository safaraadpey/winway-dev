import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";
import { previewLeoTimeline } from "@/services/dev-panel/leo";
import type { LeoPreviewPayload, LeoTimeBand } from "@/src/types/leo";
import { LEO_BEHAVIOR_PROFILES, LEO_TIME_BANDS } from "@dingmoney/leo-behavior-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function devPanelErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "unexpected error";
  if (message === "UNAUTHORIZED") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "missing or invalid session" },
      { status: 401 }
    );
  }
  if (message === "FORBIDDEN" || message === "FORBIDDEN_DEV_PANEL") {
    return NextResponse.json(
      { ok: false, error: "forbidden", message: "dev panel access required" },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: false, error: "unexpected_error", message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    await getDevPanelContextOrThrow(request);
    const body = await request.json();

    const timeBand = String(body?.timeBand ?? "") as LeoTimeBand;
    if (!LEO_TIME_BANDS.includes(timeBand)) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "timeBand is required" },
        { status: 400 }
      );
    }

    const behaviorProfile = String(body?.behaviorProfile ?? "methodical");
    if (!LEO_BEHAVIOR_PROFILES.includes(behaviorProfile as (typeof LEO_BEHAVIOR_PROFILES)[number])) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "invalid behavior profile" },
        { status: 400 }
      );
    }

    const payload: LeoPreviewPayload = {
      userId: body?.userId ? String(body.userId) : undefined,
      behaviorProfile: behaviorProfile as LeoPreviewPayload["behaviorProfile"],
      sessionBudget: Number(body?.sessionBudget ?? 0),
      hardStopLoss: Number(body?.hardStopLoss ?? 0),
      maxConcurrentTables: Number(body?.maxConcurrentTables ?? 0),
      preferredTemplateIds: Array.isArray(body?.preferredTemplateIds)
        ? body.preferredTemplateIds.map(String)
        : [],
      randomTemplateIds: Array.isArray(body?.randomTemplateIds)
        ? body.randomTemplateIds.map(String)
        : [],
      timeBand,
      windowDate: body?.windowDate ? String(body.windowDate) : undefined,
    };

    const data = await previewLeoTimeline(payload);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[Leo] POST preview error:", err);
    return devPanelErrorResponse(err);
  }
}
