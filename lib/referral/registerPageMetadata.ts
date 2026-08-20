import type { Metadata } from "next";
import { getMainOrigin } from "@/lib/auth/portalHosts";
import { getLogoImagePath } from "@/lib/theme/logoImageFiles";
import { DEFAULT_THEME } from "@/lib/theme/types";

const REGISTER_PAGE_TITLE = "لینک ثبت نام اپلیکیشن دینگ مانی";
const REGISTER_PAGE_DESCRIPTION =
  "اولین اپلیکیشن دبرنا دارای تورنومنت و تکنیک هش جهت جلوگیری از تقلب";

type RegisterPath = "/register" | "/signup";

function normalizeRefParam(ref: string | string[] | undefined): string {
  const raw = Array.isArray(ref) ? ref[0] : ref;
  return (raw || "").trim().toUpperCase();
}

export function buildRegisterPageMetadata(
  pathname: RegisterPath,
  ref: string | string[] | undefined
): Metadata {
  const siteOrigin = getMainOrigin();
  const ogPreviewImage = getLogoImagePath(DEFAULT_THEME, "ogPreview");
  const normalizedRef = normalizeRefParam(ref);
  const pageUrl = normalizedRef
    ? `${siteOrigin}${pathname}?ref=${encodeURIComponent(normalizedRef)}`
    : `${siteOrigin}${pathname}`;

  return {
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
