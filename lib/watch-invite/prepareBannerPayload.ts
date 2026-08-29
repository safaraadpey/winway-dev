import {
  buildWatchInviteBannerMeta,
  type TournamentWatchInviteBannerForm,
} from "@/lib/watch-invite/bannerOverride";
import type { WatchInviteBannerMetaOverride } from "@/lib/watch-invite/types";
import { uploadWatchInviteBannerImage } from "@/services/watch-invite-banner";

const BANNER_FORM_KEYS = [
  "watch_invite_use_override",
  "watch_invite_title",
  "watch_invite_caption",
  "watch_invite_is_enabled",
  "watch_invite_image_url",
  "watch_invite_image_width",
  "watch_invite_image_height",
  "watch_invite_image_file",
  "watch_invite_clear_image",
] as const;

export function extractWatchInviteBannerForm(
  values: TournamentWatchInviteBannerForm
): TournamentWatchInviteBannerForm {
  return {
    watch_invite_use_override: values.watch_invite_use_override,
    watch_invite_title: values.watch_invite_title,
    watch_invite_caption: values.watch_invite_caption,
    watch_invite_is_enabled: values.watch_invite_is_enabled,
    watch_invite_image_url: values.watch_invite_image_url,
    watch_invite_image_width: values.watch_invite_image_width,
    watch_invite_image_height: values.watch_invite_image_height,
    watch_invite_image_file: values.watch_invite_image_file ?? null,
    watch_invite_clear_image: values.watch_invite_clear_image ?? false,
  };
}

export function stripWatchInviteBannerFields<T extends TournamentWatchInviteBannerForm>(
  values: T
): Omit<T, (typeof BANNER_FORM_KEYS)[number]> {
  const next = { ...values } as Record<string, unknown>;
  for (const key of BANNER_FORM_KEYS) {
    delete next[key];
  }
  return next as Omit<T, (typeof BANNER_FORM_KEYS)[number]>;
}

export async function prepareWatchInviteBannerPayload(
  form: TournamentWatchInviteBannerForm
): Promise<WatchInviteBannerMetaOverride | null> {
  let nextForm = { ...form };

  if (form.watch_invite_image_file) {
    const upload = await uploadWatchInviteBannerImage(form.watch_invite_image_file);
    if (!upload.ok) {
      throw new Error(upload.error);
    }
    nextForm = {
      ...nextForm,
      watch_invite_image_url: upload.url,
      watch_invite_image_width: upload.width,
      watch_invite_image_height: upload.height,
      watch_invite_clear_image: false,
    };
  }

  if (!nextForm.watch_invite_use_override) {
    return null;
  }

  return buildWatchInviteBannerMeta(nextForm);
}
