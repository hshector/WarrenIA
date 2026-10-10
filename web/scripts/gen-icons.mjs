// Renders the brand mark to PNG icons with the preinstalled Chromium (Playwright).
// Usage: node scripts/gen-icons.mjs
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const mark = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb877"/><stop offset="0.5" stop-color="#f0883a"/><stop offset="1" stop-color="#c9561f"/></linearGradient>
  <radialGradient id="bg" cx="0.7" cy="0.1" r="1"><stop offset="0" stop-color="#1a1410"/><stop offset="1" stop-color="#07090d"/></radialGradient></defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${(512 - 2 * pad) / 32}) translate(-16 -16)">
    <ellipse cx="16" cy="16" rx="13" ry="6.2" fill="none" stroke="#f2eee8" stroke-opacity="0.42" stroke-width="1.3" transform="rotate(-24 16 16)"/>
    <circle cx="16" cy="16" r="5.2" fill="url(#g)"/>
    <circle cx="26.6" cy="10.4" r="1.9" fill="#f2eee8"/>
  </g>
</svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage();
const out = [
  ["icon-192.png", 192, 72],
  ["icon-512.png", 512, 72],
  ["icon-maskable-512.png", 512, 130],
  ["apple-touch-icon.png", 180, 72],
];
for (const [name, size, pad] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#07090d"><div style="width:${size}px;height:${size}px">${mark(pad).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</div></body></html>`);
  await writeFile(`public/icons/${name}`, await page.screenshot({ type: "png", omitBackground: false }));
  console.log("wrote", name);
}
await browser.close();
