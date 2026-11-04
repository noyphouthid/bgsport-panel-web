import type { Metadata, Viewport } from "next";
import { Geist_Mono, Nunito } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Noto_Sans_Lao_Looped } from "next/font/google";
import { themeInitScript } from "@/lib/theme";


const laoFont = Noto_Sans_Lao_Looped({
  variable: "--font-lao",
  subsets: ["lao"],
  weight: ["400", "500", "600", "700"],
});


const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
