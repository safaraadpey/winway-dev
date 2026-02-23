import type { Metadata } from "next";

const siteOrigin =
  process.env.NEXT_PUBLIC_MAIN_ORIGIN || "https://dingmoney.org";

export const metadata: Metadata = {
  title: "تورنومنت‌ها | Dingmoney - بازی آنلاین و تورنومنت دبرنا",
  description:
    "لیست تورنومنت‌های فعال و گذشته. ثبت‌نام در تورنومنت‌های دبرنا و برنده جایزه شوید.",
  openGraph: {
    title: "تورنومنت‌ها | Dingmoney - بازی آنلاین و تورنومنت دبرنا",
    description:
      "لیست تورنومنت‌های فعال و گذشته. ثبت‌نام در تورنومنت‌های دبرنا و برنده جایزه شوید.",
    url: `${siteOrigin}/player/tournaments`,
  },
  twitter: {
    title: "تورنومنت‌ها | Dingmoney - بازی آنلاین و تورنومنت دبرنا",
    description:
      "لیست تورنومنت‌های فعال و گذشته. ثبت‌نام در تورنومنت‌های دبرنا و برنده جایزه شوید.",
  },
};

export default function TournamentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
