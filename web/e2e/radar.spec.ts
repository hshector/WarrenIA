import { expect, test } from "@playwright/test";

test("home shows portfolio hero, data date and demo notice", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Demo · Cierre \d{1,2} \w+/).first()).toBeVisible();
  await expect(page.getByText("Tu cartera", { exact: true })).toBeVisible();
  await expect(page.getByText("Lo más fuerte hoy")).toBeVisible();
});

test("radar: presets, search and open an asset", async ({ page }) => {
  await page.goto("/radar");
  const items = page.locator("main ul li a");
  await expect(items.first()).toBeVisible();
  await page.getByRole("button", { name: "Acelerando" }).click();
  await expect(page.getByText(/acelerando más durante las últimas semanas/)).toBeVisible();
  await page.getByRole("button", { name: "Top" }).click();
  await page.getByLabel("Buscar").fill("X412");
  await expect(items).toHaveCount(1);
  await items.first().click();
  await expect(page).toHaveURL(/\/research\/X412/);
});

test("follow an asset and see it under «Siguiendo»", async ({ page }) => {
  await page.goto("/research/X682");
  const btn = page.getByRole("button", { name: /^(Seguir|Siguiendo)$/ });
  if ((await btn.textContent()) === "Seguir") await btn.click();
  await expect(page.getByRole("button", { name: "Siguiendo" })).toBeVisible();
  await page.waitForTimeout(400);
  await page.goto("/radar?preset=watch");
  await expect(page.getByText("Demo Materials 682").first()).toBeVisible();
});

test("ETF list is separate and excludes leveraged products", async ({ page }) => {
  await page.goto("/radar?cls=etf");
  await expect(page.getByRole("tab", { name: "ETFs" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Demo Daily 3X Bull ETF")).toHaveCount(0);
});

test("asset page: verdict first, technical detail folded", async ({ page }) => {
  await page.goto("/research/X412");
  await expect(page.getByText("Puntuación de momentum")).toBeVisible();
  for (const h of ["Por qué destaca", "Riesgos", "Qué vigilar", "En tu cartera", "Detalle técnico"]) {
    await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  }
  await page.getByText("Por qué tiene este estado").click();
  await expect(page.getByText(/condiciones/).first()).toBeVisible();
});

test("excluded asset has no score", async ({ page }) => {
  await page.goto("/research/X008");
  await expect(page.getByText("Sin puntuación")).toBeVisible();
});

test("settings menu and detail pages", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("link", { name: /Cómo se calcula/ }).click();
  await expect(page.getByText("Sensibilidad de los pesos")).toBeVisible();
  await page.goto("/settings?tab=backtest");
  await expect(page.getByText(/NO concluyentes/).first()).toBeVisible();
  await page.goto("/settings?tab=data");
  await expect(page.getByText("Cobertura del universo")).toBeVisible();
  await page.goto("/research/compare?t=X412,SPY");
  await expect(page.getByText("Evolución relativa")).toBeVisible();
});

test("asset API validates input", async ({ request }) => {
  expect((await request.get("/api/asset/..%2F..%2Fetc")).status()).toBe(404);
  expect((await request.get("/api/asset/NOPE123")).status()).toBe(404);
  const ok = await request.get("/api/asset/X412");
  expect(ok.status()).toBe(200);
  expect(ok.headers()["cache-control"]).toContain("no-store");
});
