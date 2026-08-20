import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import GlobalUserStateClient from "./GlobalUserStateClient";
import PWARegistration from "@/components/PWARegistration";
import AppSplashScreen from "@/components/AppSplashScreen";
import TextScalingGuard from "@/components/TextScalingGuard";
import { getLogoImagePath } from "@/lib/theme/logoImageFiles";
import { DEFAULT_THEME } from "@/lib/theme/types";
import {
  APP_SPLASH_IMAGE_PATH,
  APP_SPLASH_OVERLAY_ID,
  APP_SPLASH_SHELL_ID,
  getAppSplashBootScript,
  getAppSplashCriticalCss,
} from "@/lib/splash/appSplash";
import { getPwaInstallBootstrapScript } from "@/lib/pwa/pwaInstallBootstrap";

const ogPreviewImage = getLogoImagePath(DEFAULT_THEME, "ogPreview");

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
        url: ogPreviewImage,
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
    images: [ogPreviewImage],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
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
    ? "/icons/admin-icon-192.png"
    : "/icons/icon-192.png";
  const isProduction = process.env.NODE_ENV === "production";

  return (
    <html lang="en">
      <head>
        <link rel="manifest" href={manifestHref} />
        <link rel="apple-touch-icon" href={appleTouchIconHref} />
        <script
          id="winway-pwa-install-bootstrap"
          dangerouslySetInnerHTML={{
            __html: getPwaInstallBootstrapScript(isProduction),
          }}
        />
        {!isAdminHost ? (
          <>
            <link rel="preload" as="image" href={APP_SPLASH_IMAGE_PATH} />
            <style
              id="winway-app-splash-critical"
              dangerouslySetInnerHTML={{ __html: getAppSplashCriticalCss() }}
            />
            <script
              id="winway-app-splash-boot"
              dangerouslySetInnerHTML={{ __html: getAppSplashBootScript() }}
            />
          </>
        ) : null}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="bg-[#0E0E0F]">
        {!isAdminHost ? (
          <div id={APP_SPLASH_OVERLAY_ID} aria-hidden="true" />
        ) : null}
        <TextScalingGuard />
        <PWARegistration />
        <AppSplashScreen enabled={!isAdminHost} />
        <div
          id={APP_SPLASH_SHELL_ID}
          className="relative mx-auto flex min-h-dvh w-full max-w-[390px] flex-col overflow-x-hidden bg-[#0E0E0F]"
        >
          <div className="app-content-safe">
            <GlobalUserStateClient>{children}</GlobalUserStateClient>
          </div>
        </div>
        <Toaster
          position="top-center"
          containerStyle={{
            top: "calc(8px + var(--safe-area-top))",
          }}
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

