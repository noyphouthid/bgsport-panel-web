import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { themeInitScript } from "@/lib/theme";


// Fonts are bundled from app/fonts so builds never depend on fetching Google Fonts.
const laoFont = localFont({
  src: "./fonts/NotoSansLaoLooped-Lao.woff2",
  variable: "--font-lao",
  weight: "100 900",
});

const nunito = localFont({
  src: "./fonts/Nunito-Latin.woff2",
  variable: "--font-nunito",
  weight: "200 1000",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "BG SPORT ERP System",
  description: "BG SPORT ACCOUNTING SYSTEM",
};

export const viewport: Viewport = {
  themeColor: "#1c1f1d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lo" className={`${nunito.variable} ${laoFont.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
