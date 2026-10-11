import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Runs against ../data-worst (scripts/worst-case.mjs): realistic worst-case names,
// prices and portfolio sizes. Text may wrap or end in an ellipsis; it may not be
// silently clipped, and the page may not scroll sideways.

// The asset with the longest name and the largest price (see scripts/worst-case.mjs).
const store = JSON.parse(readFileSync(path.resolve(process.cwd(), ".data", "e2e-worst", "user.json"), "utf8"));
const TOP = store.instruments[1].market_ticker as string;

const PAGES = ["/", "/radar", `/research/${TOP}`, "/portfolio", "/portfolio/transactions", "/watchlist"];

for (const p of PAGES) {
  test(`worst case renders without clipping on ${p}`, async ({ page }) => {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const { scroll, clipped } = await page.evaluate(() => {
      const clipped: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("main *")) {
        const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
        if (!ownText || !el.offsetWidth) continue;
        const cs = getComputedStyle(el);
        if (cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none") continue; // intentional
        if (el.closest(".overflow-x-auto, .overflow-auto, input, select, textarea, svg")) continue; // scrolls
        if (el.scrollWidth > el.clientWidth + 1 && cs.display !== "inline") clipped.push(`${el.tagName} «${el.textContent!.trim().slice(0, 40)}»`);
      }
      return { scroll: document.documentElement.scrollWidth - window.innerWidth, clipped };
    });
    expect(scroll).toBeLessThanOrEqual(1);
    expect(clipped).toEqual([]);
  });
}

test("worst case: headline amounts drop cents, tiny positions keep their precision", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page.getByText(/^\d{1,3}(\.\d{3}){2,}\s€$/).first()).toBeVisible(); // millions, no cents
  await expect(page.getByText("0,000123 uds")).toBeVisible();
  await expect(page.getByText(/aportaciones por \d{1,3}(\.\d{3})+,\d{2}\s€/)).toBeVisible(); // formatted, not 7565580,99
});
