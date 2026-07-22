import type { Metadata } from "next";
import { getLogoImagePath } from "@/lib/theme/logoImageFiles";
import { DEFAULT_THEME } from "@/lib/theme/types";
import { getMainOrigin } from "@/lib/auth/portalHosts";

const ogPreviewImage = getLogoImagePath(DEFAULT_THEME, "ogPreview");
const siteOrigin = getMainOrigin();

export const metadata: Metadata = {
  title: "لینک ثبت نام اپلیکیشن دینگ مانی",
  description:
    "اولین اپلیکیشن دبرنا دارای تورنومنت و تکنیک هش جهت جلوگیری از تقلب",
  openGraph: {
    title: "لینک ثبت نام اپلیکیشن دینگ مانی",
    description:
      "اولین اپلیکیشن دبرنا دارای تورنومنت و تکنیک هش جهت جلوگیری از تقلب",
    url: `${siteOrigin}/register`,
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
    title: "لینک ثبت نام اپلیکیشن دینگ مانی",
    description:
      "اولین اپلیکیشن دبرنا دارای تورنومنت و تکنیک هش جهت جلوگیری از تقلب",
    images: [ogPreviewImage],
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
