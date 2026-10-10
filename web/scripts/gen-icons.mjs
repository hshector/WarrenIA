// Renders the brand mark to PNG icons with the preinstalled Chromium (Playwright).
// Usage: node scripts/gen-icons.mjs
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const mark = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="a" cx="0.15" cy="0.2" r="0.7"><stop offset="0" stop-color="#ffb070"/><stop offset="1" stop-color="#ffb070" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="0.85" cy="0.1" r="0.6"><stop offset="0" stop-color="#ff6e40"/><stop offset="1" stop-color="#ff6e40" stop-opacity="0"/></radialGradient>
    <radialGradient id="c" cx="0.4" cy="0.9" r="0.6"><stop offset="0" stop-color="#b48cff" stop-opacity="0.45"/><stop offset="1" stop-color="#b48cff" stop-opacity="0"/></radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a52"/><stop offset="1" stop-color="#e2550f"/></linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/><rect width="512" height="512" fill="url(#a)"/><rect width="512" height="512" fill="url(#b)"/><rect width="512" height="512" fill="url(#c)"/>
  <g transform="translate(256 256) scale(${(512 - 2 * pad) / 32}) translate(-16 -16)">
    <ellipse cx="16" cy="16" rx="13" ry="5.4" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="1.6" transform="rotate(-24 16 16)"/>
    <circle cx="16" cy="16" r="4.6" fill="#fff"/>
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
  await page.setContent(`<html><body style="margin:0;background:#f2611d"><div style="width:${size}px;height:${size}px">${mark(pad).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</div></body></html>`);
  await writeFile(`public/icons/${name}`, await page.screenshot({ type: "png", omitBackground: false }));
  console.log("wrote", name);
}
await browser.close();
