import type {
  WatchInviteBanner,
  WatchInviteBannerMetaOverride,
} from "@/lib/watch-invite/types";

export type TournamentWatchInviteBannerForm = {  watch_invite_use_override: boolean;
  watch_invite_title: string;
  watch_invite_caption: string;
  watch_invite_is_enabled: boolean | null;
  watch_invite_image_url: string | null;
  watch_invite_image_width: number | null;
  watch_invite_image_height: number | null;
  watch_invite_image_file?: File | null;
  watch_invite_clear_image?: boolean;
};

export const defaultTournamentWatchInviteBannerForm = (): TournamentWatchInviteBannerForm => ({
  watch_invite_use_override: false,
  watch_invite_title: "",
  watch_invite_caption: "",
  watch_invite_is_enabled: null,
  watch_invite_image_url: null,
  watch_invite_image_width: null,
  watch_invite_image_height: null,
  watch_invite_image_file: null,
  watch_invite_clear_image: false,
});

export function parseWatchInviteBannerOverrideFromMeta(
  meta: Record<string, unknown> | null | undefined
): TournamentWatchInviteBannerForm {
  const raw = meta?.watch_invite_banner;
  if (!raw || typeof raw !== "object") {
    return defaultTournamentWatchInviteBannerForm();
  }
  const override = raw as WatchInviteBannerMetaOverride;
  return {
    watch_invite_use_override: override.use_override === true,
    watch_invite_title: typeof override.title === "string" ? override.title : "",
    watch_invite_caption: typeof override.caption === "string" ? override.caption : "",
    watch_invite_is_enabled:
      typeof override.is_enabled === "boolean" ? override.is_enabled : null,
    watch_invite_image_url:
      typeof override.image_url === "string" ? override.image_url : null,
    watch_invite_image_width:
      typeof override.image_width === "number" ? override.image_width : null,
    watch_invite_image_height:
      typeof override.image_height === "number" ? override.image_height : null,
    watch_invite_image_file: null,
    watch_invite_clear_image: false,
  };
}

export function mergeWatchInviteBanner(
  globalBanner: WatchInviteBanner,
  override: WatchInviteBannerMetaOverride | null | undefined
): WatchInviteBanner {
  if (!override?.use_override) {
    return globalBanner;
  }

  const title = override.title?.trim();
  const caption = override.caption?.trim();

  return {
    title: title ? title : globalBanner.title,
    caption: caption ? caption : globalBanner.caption,
    imageUrl: override.image_url ?? globalBanner.imageUrl,
    imageWidth: override.image_width ?? globalBanner.imageWidth,
    imageHeight: override.image_height ?? globalBanner.imageHeight,
    isEnabled:
      typeof override.is_enabled === "boolean"
        ? override.is_enabled
        : globalBanner.isEnabled,
  };
}

export function buildWatchInviteBannerMeta(
  form: TournamentWatchInviteBannerForm
): WatchInviteBannerMetaOverride | null {
  if (!form.watch_invite_use_override) {
    return null;
  }

  return {
    use_override: true,
    title: form.watch_invite_title.trim() || null,
    caption: form.watch_invite_caption.trim() || null,
    image_url: form.watch_invite_clear_image ? null : form.watch_invite_image_url,
    image_width: form.watch_invite_clear_image ? null : form.watch_invite_image_width,
    image_height: form.watch_invite_clear_image ? null : form.watch_invite_image_height,
    is_enabled: form.watch_invite_is_enabled,
  };
}
