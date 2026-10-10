import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegister } from "@/components/shell/sw-register";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "WarrenIA", template: "%s · WarrenIA" },
  description: "Momentum intelligence y seguimiento de cartera personal. Herramienta de análisis; no ejecuta operaciones.",
  applicationName: "WarrenIA",
  appleWebApp: { capable: true, title: "WarrenIA", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#07090d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="orbital-canvas min-h-dvh">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
