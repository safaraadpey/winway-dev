import { NextRequest } from "next/server";
import {
  logAdminAction,
  mapAdminApiError,
  requireAdminZeroContext,
} from "@/lib/featureFlags/adminApiHelpers";
import {
  getWatchInviteBanner,
  updateWatchInviteBanner,
} from "@/lib/watch-invite/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBannerBody(body: Record<string, unknown>) {
  return {
    title: typeof body.title === "string" ? body.title.trim() : "",
    caption: typeof body.caption === "string" ? body.caption.trim() : "",
    imageUrl:
      body.imageUrl === null || typeof body.imageUrl === "string"
        ? (body.imageUrl as string | null)
        : undefined,
    imageSize:
      body.imageSize === null || typeof body.imageSize === "number"
        ? (body.imageSize as number | null)
        : undefined,
    imageWidth:
      body.imageWidth === null || typeof body.imageWidth === "number"
        ? (body.imageWidth as number | null)
        : undefined,
    imageHeight:
      body.imageHeight === null || typeof body.imageHeight === "number"
        ? (body.imageHeight as number | null)
        : undefined,
    isEnabled: Boolean(body.isEnabled),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminZeroContext(request);
    const banner = await getWatchInviteBanner();
    return Response.json({ ok: true, banner });
  } catch (err) {
    return mapAdminApiError(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { session, supabase } = await requireAdminZeroContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseBannerBody(body);

    const current = await getWatchInviteBanner();
    await updateWatchInviteBanner({
      title: parsed.title,
      caption: parsed.caption,
      imageUrl:
        parsed.imageUrl !== undefined ? parsed.imageUrl : current.imageUrl,
      imageSize:
        parsed.imageSize !== undefined ? parsed.imageSize : null,
      imageWidth:
        parsed.imageWidth !== undefined
          ? parsed.imageWidth
          : current.imageWidth,
      imageHeight:
        parsed.imageHeight !== undefined
          ? parsed.imageHeight
          : current.imageHeight,
      isEnabled: parsed.isEnabled,
      updatedBy: session.user.id,
    });

    const banner = await getWatchInviteBanner();

    await logAdminAction(
      supabase,
      session.user.id,
      "watch_invite_banner_update",
      "watch_invite_banner_settings",
      "true",
      banner,
      request
    );

    console.log("[WatchInvite] Admin banner updated", {
      adminUserId: session.user.id,
      isEnabled: banner.isEnabled,
      source: "postgresql",
    });

    return Response.json({ ok: true, banner });
  } catch (err) {
    return mapAdminApiError(err);
  }
}
