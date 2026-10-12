import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Runs against ../data-worst (scripts/worst-case.mjs): realistic worst-case names,
// prices and portfolio sizes. Text may wrap or end in an ellipsis; it may not be
// silently clipped, and the page may not scroll sideways.

// The asset with the longest name and the largest price (see scripts/worst-case.mjs).
const store = JSON.parse(readFileSync(path.resolve(process.cwd(), ".data", "e2e-worst", "user.json"), "utf8"));
const TOP = store.instruments[1].market_ticker as string;

const PAGES = [
  "/",
  "/plan",
  "/radar",
  "/radar?cls=etf&preset=all",
  `/research/${TOP}`,
  "/portfolio",
  "/portfolio/transactions",
  "/watchlist",
  "/alerts",
  "/settings",
  "/settings?tab=data",
  "/settings?tab=method",
  "/settings?tab=backtest",
  "/settings?tab=notifications",
];

for (const p of PAGES) {
  test(`worst case renders without clipping on ${p}`, async ({ page }) => {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true))); // folded content too
    const { scroll, clipped, outside } = await page.evaluate(() => {
      const clipped: string[] = [];
      // Controls and text pushed past the edge of a card or the screen. On a phone
      // the layout viewport grows to fit, so compare against clientWidth.
      const outside: string[] = [];
      const vw = document.documentElement.clientWidth;
      const scrolls = (el: Element) => {
        for (let a = el.parentElement; a; a = a.parentElement) {
          if (/(auto|scroll)/.test(getComputedStyle(a).overflowX) && a.scrollWidth > a.clientWidth + 1) return true;
        }
        return false;
      };
      for (const el of document.querySelectorAll<HTMLElement>("header *, main *, nav *")) {
        if (!/^(BUTTON|A|LABEL|INPUT|SELECT|SUMMARY|H1|H2|H3|P|DT|DD|TD|TH)$/.test(el.tagName) && el.getAttribute("role") !== "tab") continue;
        const r = el.getBoundingClientRect();
        if (!r.width || el.closest("svg, canvas, .sr-only") || scrolls(el)) continue;
        let left = 0;
        let right = vw;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (getComputedStyle(a).overflowX === "visible") continue;
          const ar = a.getBoundingClientRect();
          left = Math.max(left, ar.left);
          right = Math.min(right, ar.right);
        }
        if (r.right > right + 1.5 || r.left < left - 1.5) outside.push(`${el.tagName} «${(el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40)}»`);
      }
      for (const el of document.querySelectorAll<HTMLElement>("main *")) {
        const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
        if (!ownText || !el.offsetWidth) continue;
        const cs = getComputedStyle(el);
        if (cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none") continue; // intentional
        if (el.closest(".overflow-x-auto, .overflow-auto, input, select, textarea, svg")) continue; // scrolls
        if (el.scrollWidth > el.clientWidth + 1 && cs.display !== "inline") clipped.push(`${el.tagName} «${el.textContent!.trim().slice(0, 40)}»`);
      }
      return { scroll: document.documentElement.scrollWidth - vw, clipped, outside };
    });
    expect(scroll).toBeLessThanOrEqual(1);
    expect(clipped).toEqual([]);
    expect(outside).toEqual([]);
  });
}

test("worst case: headline amounts drop cents, tiny positions keep their precision", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page.getByText(/^€\d{1,3}(,\d{3}){2,}$/).first()).toBeVisible(); // millions, no cents
  await expect(page.getByText("0.000123 units")).toBeVisible();
  await page.locator("summary", { hasText: /\d+ notices?$/ }).click();
  await expect(page.getByText(/Deposits of €\d{1,3}(,\d{3})+\.\d{2} were inferred/)).toBeVisible(); // formatted, not 7565580.99
});

test("company logos: cached logo is shown, otherwise initials", async ({ page, request }) => {
  const ok = await request.get(`/api/logo/${TOP}`);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/png");
  expect((await request.get("/api/logo/NOLOGO")).status()).toBe(404);
  expect((await request.get("/api/logo/..%2F..%2Fsecret")).status()).toBe(404);

  await page.goto("/radar");
  const withLogo = page.locator(`a[href="/research/${TOP}"]`).first().locator("img");
  await expect(withLogo).toBeVisible();
  await expect.poll(() => withLogo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  const other = page.locator('main ul li a[href^="/research/"]').filter({ hasNot: page.locator(`[href="/research/${TOP}"]`) }).nth(3);
  await expect(other.locator("img")).toHaveCount(0); // 404 -> back to initials
});
