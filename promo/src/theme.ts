// Brand tokens from web/app/globals.css (dark = :root.dark, light = :root).
// The video base is near-black (#0A0A0A) per the brief; panels use the app's surfaces.
export const dark = {
  bg: "#0A0A0A",
  canvas: "#000000",
  surface: "#1c1c1e",
  surface2: "#2c2c2e",
  surface3: "#3a3a3c",
  line: "rgba(255,255,255,0.08)",
  line2: "rgba(255,255,255,0.15)",
  ink: "#f5f5f7",
  ink2: "#a1a1a6",
  ink3: "#6e6e73",
  accent: "#8dbf9c",
  accent2: "#a8d4b5",
  accentInk: "#10241a",
  accentSoft: "#1a2a20",
  pos: "#74c795",
  neg: "#e58c80",
  gold: "#d9b866",
  violet: "#b8a6d8",
  sand: "#d9b98a",
  hero1: "#3a5c48",
  hero2: "#2e4a3a",
  hero3: "#4b7059",
  hero4: "#2a4236",
  hero6: "#24392d",
  heroInk: "#e8f3ec",
  av: ["#1f2a22", "#1f2430", "#2b261c", "#262130", "#232a1d", "#2e2220"],
} as const;

export const light = {
  bg: "#ffffff",
  canvas: "#f3f4f1",
  surface: "#ffffff",
  ink: "#111111",
  ink2: "#686b66",
  ink3: "#a0a39d",
  accent: "#527f62",
  line: "rgba(17,17,17,0.07)",
} as const;

// Video-only data palette: the app's Salvia / gold / violet with chroma raised so
// series stay apart on black (checked with the dataviz validator: CVD ΔE ≥ 8,
// normal-vision ΔE ≥ 15, contrast ≥ 3:1 on #1c1c1e). Order is fixed:
// Core (Salvia), Diversifiers (gold), Momentum (violet); sand only for particles.
export const series = {
  salvia: "#6fbf88",
  gold: "#e3ad3c",
  violet: "#9d86e6",
  sand: "#dcb27e",
} as const;

export const seriesLight = {
  salvia: "#3f7d55",
  gold: "#b07a12",
  violet: "#6c55b8",
  sand: "#a8834f",
} as const;

export const FONT = "Geist";
export const MONO = "Geist Mono";
