import type { Metadata } from "next";

const siteOrigin =
  process.env.NEXT_PUBLIC_MAIN_ORIGIN || "https://dingmoney.org";

export const metadata: Metadata = {
  title: "لینک ثبت نام اپلیکیشن دینگ مانی",
  description:
    "اولین اپلیکیشن دبرنا دارای تورنومنت و تکنیک هش جهت جلوگیری از تقلب",
  openGraph: {
    title: "لینک ثبت نام اپلیکیشن دینگ مانی",
    description:
      "اولین اپلیکیشن دبرنا دارای تورنومنت و تکنیک هش جهت جلوگیری از تقلب",
    url: `${siteOrigin}/signup`,
    images: [
      {
        url: "/ding_money_preview.jpg",
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
    images: ["/ding_money_preview.jpg"],
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
