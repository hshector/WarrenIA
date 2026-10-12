#!/usr/bin/env node
// Generates the app icons from the brand mark (a rounded double U, black on white,
// with two sage squares over the outer stems).
// Source of truth: MARK below, the same path as <BrandMark> in components/shell/brand.tsx.
//
//   node scripts/icons.mjs
//
// Writes public/icons/{icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png,
// apple-touch-icon.png}. Icons are full-bleed squares: iOS and Android round them.

import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";

// Centred in a 32x32 box: content spans y 5.15 (top of the squares) to 26.85.
const MARK = "M6 11.55v8.5a5 5 0 0 0 10 0a5 5 0 0 0 10 0V11.55";
const STROKE = 3.6;
const SAGE = "#527f62"; // --accent (light)
const DOTS = [4.5, 24.5].map((x) => `<rect x="${x}" y="5.15" width="3" height="3" rx="0.6" fill="${SAGE}"/>`).join("");
const out = path.resolve(process.cwd(), "public", "icons");

/** `scale` = share of the canvas the 32-unit mark box takes (maskable keeps to the 80 % safe zone). */
const svg = (size, scale, rounded = false) => {
  const box = size * scale;
  const k = box / 32;
  const off = (size - box) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" ${rounded ? `rx="${size * 0.225}"` : ""} fill="#ffffff"/>
<g transform="translate(${off} ${off}) scale(${k})"><path d="${MARK}" fill="none" stroke="#111111" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>${DOTS}</g>
</svg>`;
};

// Browser tab: rounded white tile so it reads on dark tab bars too.
writeFileSync(path.join(out, "icon.svg"), svg(32, 0.86, true));

const pngs = [
  ["icon-192.png", 192, 0.7],
  ["icon-512.png", 512, 0.7],
  ["icon-maskable-512.png", 512, 0.56],
  ["apple-touch-icon.png", 180, 0.7],
];
const browser = await chromium.launch(process.env.CI ? {} : { executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
for (const [file, size, scale] of pngs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}</style>${svg(size, scale)}`);
  await page.locator("svg").screenshot({ path: path.join(out, file), omitBackground: false });
}
await browser.close();
console.log(`Icons written to ${out}`);
