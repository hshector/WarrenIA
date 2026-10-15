// Captures the app in local demo mode (synthetic market, synthetic portfolio) for the promo.
// Prereqs (see promo/KICKOFF.md): `python -m warrenia_engine demo` and
// `cd web && WARRENIA_LOCAL_MODE=1 npm run dev` on http://localhost:3000.
// Usage: node promo/scripts/capture.mjs [outDir]   (default promo/assets/raw/stills)
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../web/package.json"));
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve(process.argv[2] ?? path.resolve(here, "../assets/raw/stills"));
mkdirSync(OUT, { recursive: true });

// Synthetic only: demo tickers (X…) from the engine's fake market.
const SEED = [
  "fecha;tipo;ticker;nombre;cantidad;precio;importe;comision;divisa",
  "03/11/2025;aportación;;;;;12000;;EUR",
  "04/11/2025;compra;X682;Demo Materials 682;40;48;;1;EUR",
  "02/12/2025;compra;X615;Demo Energy 615;25;62;;1;EUR",
  "05/01/2026;compra;X134;Demo Consumer Discretionary 134;30;41;;1;EUR",
  "03/02/2026;compra;X682;Demo Materials 682;20;55;;1;EUR",
].join("\n");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

async function context(theme) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: theme,
    locale: "en-GB",
  });
  await ctx.addInitScript((t) => localStorage.setItem("warrenia-theme", t), theme);
  // Never show third-party company logos: avatars fall back to ticker initials.
  await ctx.route("**/api/logo/**", (r) => r.fulfill({ status: 404, body: "" }));
  return ctx;
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

async function shot(page, name, opts = {}) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
  console.log("saved", name);
}

// Seed once (local store is shared by both themes).
{
  const ctx = await context("light");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/portfolio`);
  await settle(page);
  if (await page.getByText("Your portfolio is empty").isVisible().catch(() => false)) {
    await page.goto(`${BASE}/portfolio/import`);
    await page.locator("textarea").fill(SEED);
    await page.getByRole("button", { name: "Preview and check" }).click();
    await page.getByRole("button", { name: /Import \d+ valid rows/ }).click();
    await page.getByText(/transactions imported/).waitFor();
    console.log("seeded synthetic portfolio");
  }
  await ctx.close();
}

for (const theme of ["dark", "light"]) {
  const ctx = await context(theme);
  const page = await ctx.newPage();
  for (const [route, name] of [
    ["/", "home"],
    ["/plan", "plan"],
    ["/radar", "radar"],
    ["/portfolio", "portfolio"],
  ]) {
    await page.goto(`${BASE}${route}`);
    await shot(page, `${name}-${theme}`);
    await shot(page, `${name}-${theme}-full`, { fullPage: true });
  }

  // Before you sell: open the estimate panel and fill a hypothetical sale.
  await page.goto(`${BASE}/portfolio`);
  await settle(page);
  await page.getByText("Before you sell").click();
  const what = page.getByLabel("What");
  const firstHolding = await what.locator("option").nth(1).getAttribute("value");
  if (firstHolding) await what.selectOption(firstHolding);
  await page.getByLabel("Units").fill("20");
  await page.getByLabel(/^Price/).fill("71");
  await page.getByLabel("Fee (€)").fill("1,00");
  await page.getByText(/^Gain|^Loss/).first().waitFor().catch(() => {});
  await shot(page, `sell-${theme}`);
  await shot(page, `sell-${theme}-full`, { fullPage: true });
  await ctx.close();
}

await browser.close();
