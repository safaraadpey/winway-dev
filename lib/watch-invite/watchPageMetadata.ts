import type { Metadata } from "next";
import { getMainPublicOrigin } from "@/lib/auth/portalHosts";
import { getLogoImagePath } from "@/lib/theme/logoImageFiles";
import { DEFAULT_THEME } from "@/lib/theme/types";
import { buildWatchInvitePath } from "@/lib/watch-invite/buildWatchLink";
import {
  getInviteTokenRow,
  getTournamentByWatchCode,
  getWatchInviteBannerForWatchCode,
} from "@/lib/watch-invite/repository";

const DEFAULT_WATCH_TITLE = "تماشای تورنومنت | Dingmoney";
const DEFAULT_WATCH_DESCRIPTION =
  "اولین اپلیکیشن دبرنا دارای تورنومنت و تکنیک هش جهت جلوگیری از تقلب";

function resolveAbsoluteImageUrl(imageUrl: string, siteOrigin: string): string {
  if (/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }
  return new URL(imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`, siteOrigin).toString();
}

function buildDefaultWatchMetadata(siteOrigin: string): Metadata {
  const absoluteOgImage = new URL(
    getLogoImagePath(DEFAULT_THEME, "ogPreview"),
    siteOrigin
  ).toString();

  return {
    metadataBase: new URL(siteOrigin),
    title: DEFAULT_WATCH_TITLE,
    description: DEFAULT_WATCH_DESCRIPTION,
    openGraph: {
      type: "website",
      locale: "fa_IR",
      siteName: "Dingmoney - بازی آنلاین و تورنومنت دبرنا",
      title: DEFAULT_WATCH_TITLE,
      description: DEFAULT_WATCH_DESCRIPTION,
      images: [
        {
          url: absoluteOgImage,
          width: 1200,
          height: 630,
          alt: "Dingmoney - بازی آنلاین و تورنومنت دبرنا",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: DEFAULT_WATCH_TITLE,
      description: DEFAULT_WATCH_DESCRIPTION,
      images: [absoluteOgImage],
    },
  };
}

type WatchPageMetadataParams = {
  watchCode: string;
  inviteToken: string;
};

export async function buildWatchPageMetadata(
  params: WatchPageMetadataParams
): Promise<Metadata> {
  const siteOrigin = getMainPublicOrigin();
  const defaultMetadata = buildDefaultWatchMetadata(siteOrigin);

  const watchCode = Number(params.watchCode);
  const inviteToken = decodeURIComponent(params.inviteToken || "")
    .trim()
    .toUpperCase();

  if (!Number.isFinite(watchCode) || watchCode <= 0 || !inviteToken) {
    return defaultMetadata;
  }

  try {
    const [tournament, tokenRow, banner] = await Promise.all([
      getTournamentByWatchCode(watchCode),
      getInviteTokenRow(inviteToken),
      getWatchInviteBannerForWatchCode(watchCode),
    ]);

    if (!tournament || !tokenRow) {
      return defaultMetadata;
    }

    const pageUrl = `${siteOrigin}${buildWatchInvitePath(watchCode, inviteToken)}`;
    const defaultOgImage = new URL(
      getLogoImagePath(DEFAULT_THEME, "ogPreview"),
      siteOrigin
    ).toString();

    const title =
      banner.isEnabled && banner.title.trim()
        ? banner.title.trim()
        : tournament.title?.trim() || "تماشای تورنومنت";
    const description =
      banner.isEnabled && banner.caption.trim()
        ? banner.caption.trim()
        : DEFAULT_WATCH_DESCRIPTION;

    const ogImageUrl =
      banner.isEnabled && banner.imageUrl
        ? resolveAbsoluteImageUrl(banner.imageUrl, siteOrigin)
        : defaultOgImage;

    const ogImageWidth = banner.imageWidth ?? 1200;
    const ogImageHeight = banner.imageHeight ?? 630;

    return {
      metadataBase: new URL(siteOrigin),
      title,
      description,
      openGraph: {
        type: "website",
        locale: "fa_IR",
        siteName: "Dingmoney - بازی آنلاین و تورنومنت دبرنا",
        title,
        description,
        url: pageUrl,
        images: [
          {
            url: ogImageUrl,
            width: ogImageWidth,
            height: ogImageHeight,
            alt: title,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImageUrl],
      },
      alternates: {
        canonical: pageUrl,
      },
    };
  } catch (err) {
    console.error("[WatchInvite] buildWatchPageMetadata error:", err);
    return defaultMetadata;
  }
}
