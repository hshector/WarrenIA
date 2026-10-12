import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WarrenIA — Momentum Intelligence",
    short_name: "WarrenIA",
    description: "Investment plan, momentum radar and personal portfolio tracking. Analysis only, never places orders.",
    start_url: "/",
    scope: "/",
    // Android: full screen, with the status bar and the system navigation bar hidden
    // (a swipe from the edge shows them for a moment). iOS ignores display_override
    // and keeps "standalone".
    display: "standalone",
    display_override: ["fullscreen", "standalone"],
    orientation: "portrait-primary",
    background_color: "#f3f4f1",
    theme_color: "#f3f4f1",
    lang: "en",
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
