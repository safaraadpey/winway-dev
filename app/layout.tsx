import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import GlobalUserStateClient from "./GlobalUserStateClient";

export const metadata: Metadata = {
  title: "Dingmoney Bingo",
  description: "Bingo game application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="bg-white" style={{ maxWidth: '390px', margin: '0 auto', width: '100%', overflowX: 'hidden', position: 'relative' }}>
        <GlobalUserStateClient>{children}</GlobalUserStateClient>
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

