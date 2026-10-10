import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WarrenIA — Momentum Intelligence",
    short_name: "WarrenIA",
    description: "Momentum Radar y seguimiento de cartera personal. Análisis, sin ejecución de órdenes.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#07090d",
    theme_color: "#07090d",
    lang: "es",
    categories: ["finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Momentum Radar", url: "/radar" },
      { name: "Portfolio", url: "/portfolio" },
    ],
  };
}
