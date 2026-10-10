import { expect, test } from "@playwright/test";

for (const p of ["/", "/radar", "/research", "/research/X412", "/portfolio", "/watchlist", "/settings", "/settings?tab=method", "/settings?tab=backtest"]) {
  test(`no horizontal page scroll on ${p}`, async ({ page }) => {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("mobile radar uses compact rows and bottom navigation", async ({ page }) => {
  await page.goto("/radar");
  await expect(page.getByRole("navigation", { name: "Principal" }).last()).toBeVisible();
  await expect(page.locator('[role="table"]')).toHaveCount(0);
  const first = page.locator("button", { hasText: /Demo/ }).first();
  await first.click();
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
