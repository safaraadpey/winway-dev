import type { Metadata } from "next";
import { getMainPublicOrigin } from "@/lib/auth/portalHosts";
import { getLogoImagePath } from "@/lib/theme/logoImageFiles";
import { DEFAULT_THEME } from "@/lib/theme/types";
import {
  normalizeReferralCodeSegment,
  normalizeReferralRefParam,
} from "@/lib/referral/normalizeReferralCode";

const REGISTER_PAGE_TITLE = "لینک ثبت نام اپلیکیشن دینگ مانی";
const REGISTER_PAGE_DESCRIPTION =
  "اولین اپلیکیشن دبرنا دارای تورنومنت و تکنیک هش جهت جلوگیری از تقلب";

type BuildRegisterPageMetadataOptions = {
  /** Path segment or raw referral code for /register/[code] */
  referralCode?: string | null;
  /** Legacy query ref (?ref=) — metadata only, e.g. /signup before redirect */
  legacyQueryRef?: string | string[] | undefined;
  /** When set with legacyQueryRef, emit /signup?ref= URL instead of path-based */
  legacySignupPath?: boolean;
};

function resolveRegisterPageUrl(
  options: BuildRegisterPageMetadataOptions
): string {
  const siteOrigin = getMainPublicOrigin();
  const fromPath = options.referralCode
    ? normalizeReferralCodeSegment(options.referralCode)
    : "";
  const fromQuery = normalizeReferralRefParam(options.legacyQueryRef);
  const normalizedRef = fromPath || fromQuery;

  if (!normalizedRef) {
    return `${siteOrigin}/register`;
  }

  if (options.legacySignupPath && fromQuery && !fromPath) {
    return `${siteOrigin}/signup?ref=${encodeURIComponent(normalizedRef)}`;
  }

  return `${siteOrigin}/register/${encodeURIComponent(normalizedRef)}`;
}

export function buildRegisterPageMetadata(
  options: BuildRegisterPageMetadataOptions = {}
): Metadata {
  const siteOrigin = getMainPublicOrigin();
  const ogPreviewImage = getLogoImagePath(DEFAULT_THEME, "ogPreview");
  const pageUrl = resolveRegisterPageUrl(options);

  return {
    metadataBase: new URL(siteOrigin),
    title: REGISTER_PAGE_TITLE,
    description: REGISTER_PAGE_DESCRIPTION,
    openGraph: {
      title: REGISTER_PAGE_TITLE,
      description: REGISTER_PAGE_DESCRIPTION,
      url: pageUrl,
      images: [
        {
          url: ogPreviewImage,
          width: 1200,
          height: 630,
          alt: "Dingmoney - بازی آنلاین و تورنومنت دبرنا",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: REGISTER_PAGE_TITLE,
      description: REGISTER_PAGE_DESCRIPTION,
      images: [ogPreviewImage],
    },
    alternates: {
      canonical: pageUrl,
    },
  };
}
