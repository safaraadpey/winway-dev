import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import GlobalUserStateClient from "./GlobalUserStateClient";
import PWARegistration from "@/components/PWARegistration";
import PwaSafeArea from "@/components/PwaSafeArea";

const siteOrigin =
  process.env.NEXT_PUBLIC_MAIN_ORIGIN || "https://dingmoney.org";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "Dingmoney - بازی آنلاین و تورنومنت دبرنا",
  description:
    "اولین اپلیکیشن دبرنا دارای تورنومنت و تکنیک هش جهت جلوگیری از تقلب",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dingmoney - بازی آنلاین و تورنومنت دبرنا",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    url: siteOrigin,
    siteName: "Dingmoney - بازی آنلاین و تورنومنت دبرنا",
    title: "Dingmoney - بازی آنلاین و تورنومنت دبرنا",
    description:
      "اولین اپلیکیشن دبرنا دارای تورنومنت و تکنیک هش جهت جلوگیری از تقلب",
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
    title: "Dingmoney - بازی آنلاین و تورنومنت دبرنا",
    description:
      "اولین اپلیکیشن دبرنا دارای تورنومنت و تکنیک هش جهت جلوگیری از تقلب",
    images: ["/ding_money_preview.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#0E0E0F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const host = (headers().get("host") || "").split(":")[0].toLowerCase();
  const adminHost = (
    process.env.ADMIN_APP_HOST ||
    process.env.NEXT_PUBLIC_ADMIN_HOST ||
    "admin.dingmoney.org"
  ).toLowerCase();
  const isAdminHost = host === adminHost;
  const manifestHref = isAdminHost
    ? "/manifest-admin.webmanifest"
    : "/manifest-player.webmanifest";
  const appleTouchIconHref = isAdminHost
    ? "/icons/admin-icon-192.svg"
    : "/icons/icon-192.svg";

  return (
    <html lang="en">
      <head>
        <link rel="manifest" href={manifestHref} />
        <link rel="apple-touch-icon" href={appleTouchIconHref} />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="bg-[#0E0E0F]">
        <PWARegistration />
        <PwaSafeArea />
        <div className="app-shell">
          <GlobalUserStateClient>{children}</GlobalUserStateClient>
        </div>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              duration: 4000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </body>
    </html>
  );
}

