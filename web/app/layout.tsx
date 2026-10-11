import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegister } from "@/components/shell/sw-register";
import { ThemeProvider } from "@/components/shell/theme";
import { Toaster } from "@/components/shell/toaster";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "WarrenIA", template: "%s · WarrenIA" },
  description: "Momentum intelligence y seguimiento de cartera personal. Herramienta de análisis; no ejecuta operaciones.",
  applicationName: "WarrenIA",
  appleWebApp: { capable: true, title: "WarrenIA", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android: the keyboard shrinks the layout viewport (as on iOS), so sheets and dvh react to it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html> before React hydrates.
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
