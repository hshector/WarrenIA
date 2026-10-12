import { expect, test } from "@playwright/test";

test("home shows portfolio hero, data date and demo notice", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Demo · Close \d{1,2} \w+/).first()).toBeVisible();
  await expect(page.getByText("Your portfolio", { exact: true })).toBeVisible();
  await expect(page.getByText("Buy candidates", { exact: true })).toBeVisible();
  await expect(page.getByText("Your next contribution")).toBeVisible();
});

test("radar opens on «Buy now»: only candidates, overheated leaders apart", async ({ page }) => {
  await page.goto("/radar");
  await expect(page.getByText(/not overheated, with solid finances/)).toBeVisible();
  const pills = page.locator("main ul li a").getByText(/^(Buy candidate|Wait for a dip|Watch|Avoid|No signal)$/);
  await expect(pills.first()).toBeVisible();
  expect(new Set(await pills.allTextContents())).toEqual(new Set(["Buy candidate"]));
  await page.getByRole("button", { name: "Wait for a dip" }).click();
  expect(new Set(await pills.allTextContents())).toEqual(new Set(["Wait for a dip"]));
});

test("plan: products with ISIN, core chooser, diversifier mix and Spanish taxes", async ({ page }) => {
  await page.goto("/plan");
  await expect(page.getByText("ISIN IE00BK5BQT80").first()).toBeVisible();
  await expect(page.getByText(/V0267-25/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Taxes in Spain/ })).toBeVisible();
  // Core chooser: no emerging markets -> the cheapest MSCI World.
  await page.getByRole("tablist", { name: "Include emerging markets?" }).getByRole("tab", { name: "No" }).click();
  await expect(page.getByText("ISIN IE00BJ0KDQ92").first()).toBeVisible();
  // Diversifiers: pick the "Steady" mix and save it; the monthly split then lists both products.
  await page.getByRole("button", { name: "Steady" }).click();
  await page.getByRole("button", { name: "Save mix" }).click();
  await expect(page.getByText("Plan updated")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Short euro government bonds · LU1650487413/).first()).toBeVisible();
  // Behaviour figures come from the engine's proxies.
  await expect(page.getByText("Yearly swings").first()).toBeVisible();
});

test("radar: presets, search and open an asset", async ({ page }) => {
  await page.goto("/radar");
  const items = page.locator("main ul li a");
  await expect(items.first()).toBeVisible();
  await page.getByRole("button", { name: "Speeding up" }).click();
  await expect(page.getByText(/speeding up the most in recent weeks/)).toBeVisible();
  await page.getByRole("button", { name: "Full ranking" }).click();
  await page.getByLabel("Search").fill("X412");
  await expect(items).toHaveCount(1);
  await items.first().click();
  await expect(page).toHaveURL(/\/research\/X412/);
});

test("follow an asset and see it under «Following»", async ({ page }) => {
  await page.goto("/research/X682");
  const btn = page.getByRole("button", { name: /^(Follow|Following)$/ });
  if ((await btn.textContent()) === "Follow") await btn.click();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
  await page.waitForTimeout(400);
  await page.goto("/radar?preset=watch");
  await expect(page.getByText("Demo Materials 682").first()).toBeVisible();
});

test("ETF list is separate, excludes leveraged products and says they are not buyable", async ({ page }) => {
  await page.goto("/radar?cls=etf");
  await expect(page.getByRole("tab", { name: "ETFs" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Demo Daily 3X Bull ETF")).toHaveCount(0);
  await expect(page.getByText(/you cannot buy them/)).toBeVisible();
});

test("asset page: what it is, what to do, fundamentals, technical detail folded", async ({ page }) => {
  await page.goto("/research/X412");
  for (const h of ["What it is", "Fundamentals", "Why it stands out", "Risks", "What to watch", "In your portfolio", "Technical detail"]) {
    await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Momentum score", { exact: true })).toBeVisible();
  await expect(page.getByText("What to do now", { exact: true })).toBeVisible();
  await expect(page.getByText("Piotroski F-Score", { exact: true })).toBeVisible();
  await page.getByText("The nine F-Score checks").click();
  await expect(page.getByText("Generated cash from its business")).toBeVisible();
  await page.getByText("Why it has this status").click();
  await expect(page.getByText(/conditions/).first()).toBeVisible();
});

test("excluded asset has no score", async ({ page }) => {
  await page.goto("/research/X008");
  await expect(page.getByText("Not scored")).toBeVisible();
});

test("settings menu and detail pages", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("link", { name: /How it is calculated/ }).click();
  await expect(page.getByText("Weight sensitivity")).toBeVisible();
  await expect(page.getByText("Piotroski F-Score (2000)")).toBeVisible();
  await page.goto("/settings?tab=backtest");
  await expect(page.getByText(/NOT conclusive/).first()).toBeVisible();
  await page.goto("/settings?tab=data");
  await expect(page.getByText("Market coverage")).toBeVisible();
  await page.goto("/research/compare?t=X412,SPY");
  await expect(page.getByText("Relative performance")).toBeVisible();
  await expect(page.getByText("Fundamentals score")).toBeVisible();
});

test("asset API validates input", async ({ request }) => {
  expect((await request.get("/api/asset/..%2F..%2Fetc")).status()).toBe(404);
  expect((await request.get("/api/asset/NOPE123")).status()).toBe(404);
  const ok = await request.get("/api/asset/X412");
  expect(ok.status()).toBe(200);
  expect(ok.headers()["cache-control"]).toContain("no-store");
});

test("plan: wealth projection and the optional cash block", async ({ page }) => {
  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "Where this could take you" })).toBeVisible();
  await expect(page.getByText(/Chance of ending with less than you put in/)).toBeVisible();
  await page.getByRole("tablist", { name: "Years" }).getByRole("tab", { name: "40 y" }).click();
  await expect(page.getByText("In 40 years, in today's euros (after inflation)")).toBeVisible();
  await expect(page.getByRole("heading", { name: /4\. Cash/ })).toBeVisible();
  await expect(page.getByText("No ISIN: it is the balance of your account").first()).toBeVisible();
  await expect(page.getByText("ISIN LU0290358497").first()).toBeVisible();
});

test("alerts page and notification settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Alerts", exact: true }).click();
  await expect(page).toHaveURL(/\/alerts/);
  await expect(page.getByRole("heading", { name: "Alerts" })).toBeVisible();
  await expect(page.getByText(/Close of /).first()).toBeVisible();
  await page.getByText(/Every change that day/).click();
  await expect(page.getByText(/ → /).first()).toBeVisible();
  await page.goto("/settings?tab=notifications");
  await expect(page.getByRole("switch", { name: /Stocks you own/ })).toHaveAttribute("aria-checked", "true");
  // Without a VAPID key configured, the page offers to generate one in the browser.
  await page.getByRole("button", { name: "Generate keys" }).click();
  await expect(page.getByText("Private key (secret)")).toBeVisible();
  await page.getByRole("switch", { name: /New buy candidates/ }).click();
  await expect(page.getByRole("switch", { name: /New buy candidates/ })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: /New buy candidates/ })).toBeEnabled(); // saved
  await page.reload();
  await expect(page.getByRole("switch", { name: /New buy candidates/ })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("switch", { name: /New buy candidates/ }).click();
});

test("IFRS filer with ADRs: fundamentals from its euro report, no price ratios", async ({ page }) => {
  await page.goto("/research/X023");
  await expect(page.getByText(/SEC annual report \(IFRS/)).toBeVisible();
  await expect(page.getByText(/reported in EUR/)).toBeVisible();
  await expect(page.getByText("n/a (ADR)").first()).toBeVisible();
});
