import type { Metadata } from "next";

const siteOrigin =
  process.env.NEXT_PUBLIC_MAIN_ORIGIN || "https://dingmoney.org";

export const metadata: Metadata = {
  title: "لینک ثبت نام اپلیکیشن دینگ مانی",
  description:
    "اپلیکیشن دبرنای آنلاین و تورنومنت دبرنای دینگ مانی- بازی کنید، برنده شوید.",
  openGraph: {
    title: "لینک ثبت نام اپلیکیشن دینگ مانی",
    description:
      "اپلیکیشن دبرنای آنلاین و تورنومنت دبرنای دینگ مانی- بازی کنید، برنده شوید.",
    url: `${siteOrigin}/signup`,
  },
  twitter: {
    title: "لینک ثبت نام اپلیکیشن دینگ مانی",
    description:
      "اپلیکیشن دبرنای آنلاین و تورنومنت دبرنای دینگ مانی- بازی کنید، برنده شوید.",
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
