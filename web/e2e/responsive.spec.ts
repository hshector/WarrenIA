import { expect, test } from "@playwright/test";

for (const p of ["/", "/plan", "/radar", "/research/X412", "/portfolio", "/portfolio/transactions", "/settings", "/settings?tab=data", "/settings?tab=method", "/settings?tab=backtest"]) {
  test(`no horizontal page scroll on ${p}`, async ({ page }) => {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("mobile: bottom tab bar and tappable radar rows", async ({ page }) => {
  await page.goto("/radar");
  const tabs = page.getByRole("navigation", { name: "Main" }).last();
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link")).toHaveCount(5);
  await page.locator("main ul li a").first().click();
  await expect(page).toHaveURL(/\/research\//);
});

test("manifest and service worker are served", async ({ request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.status()).toBe(200);
  const j = await m.json();
  expect(j.display).toBe("standalone");
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toContain("no-store");
});
