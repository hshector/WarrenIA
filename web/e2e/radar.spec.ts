import { expect, test } from "@playwright/test";

test("overview shows data date and demo banner", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("DEMO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^Cierre \d{1,2} \w+ \d{4}/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Régimen de mercado")).toBeVisible();
});

test("radar: presets, search, sort, quick view and watchlist", async ({ page }) => {
  await page.goto("/radar");
  const rows = page.locator('[role="table"] [role="row"]');
  await expect(rows.nth(1)).toBeVisible();
  // First data row is rank 1
  await expect(rows.nth(1).locator('[role="cell"]').first()).toHaveText("1");

  await page.getByRole("button", { name: "Acelerando" }).click();
  await expect(page.getByText("¿Cuáles están acelerando más durante las últimas semanas?").first()).toBeVisible();
  await page.getByRole("button", { name: "Ranking completo" }).click();

  await page.getByLabel("Buscar").fill("X412");
  await expect(rows).toHaveCount(2); // header + 1
  await page.getByLabel("Buscar").fill("");

  await page.getByRole("columnheader", { name: /Risk/ }).click();
  await expect(page.getByRole("columnheader", { name: /Risk/ })).toHaveAttribute("aria-sort", /ascending|descending/);

  // Quick view
  await rows.nth(1).click();
  await expect(page.getByRole("link", { name: /Ficha completa/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // Watchlist toggle persists
  const ticker = (await rows.nth(1).locator("span.font-mono").first().textContent())!.trim();
  await page.getByRole("button", { name: `Añadir ${ticker} a la watchlist` }).click();
  await expect(page.getByRole("button", { name: `Quitar ${ticker} de la watchlist` })).toBeVisible();
  await page.waitForTimeout(500);
  await page.goto("/watchlist");
  await expect(page.getByRole("link", { name: new RegExp(ticker) }).first()).toBeVisible();
});

test("ETF ranking is separate from stocks", async ({ page }) => {
  await page.goto("/radar?cls=etf");
  await expect(page.getByText(/ETFs elegibles/).first()).toBeVisible();
  await expect(page.locator('[role="table"]').getByText("Demo Daily 3X Bull ETF")).toHaveCount(0);
});

test("asset page: scores, rule trace and structured report", async ({ page }) => {
  await page.goto("/research/X412");
  await expect(page.getByText("Overall", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clasificación" })).toBeVisible();
  for (const h of ["Thesis", "Evidence", "Risks", "Invalidation", "Data quality", "Portfolio relevance"]) {
    await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/No se proponen precios objetivo/)).toBeVisible();
});

test("excluded asset is labelled, not scored", async ({ page }) => {
  await page.goto("/research/X008");
  await expect(page.getByText("Fuera del universo puntuable")).toBeVisible();
  await expect(page.getByText(/Historial insuficiente/)).toBeVisible();
});

test("compare and methodology pages", async ({ page }) => {
  await page.goto("/research/compare?t=X412,SPY");
  await expect(page.getByText("Evolución relativa")).toBeVisible();
  await page.goto("/settings?tab=method");
  await expect(page.getByText("Sensibilidad de los pesos")).toBeVisible();
  await page.goto("/settings?tab=backtest");
  await expect(page.getByText(/NO concluyentes/).first()).toBeVisible();
  await page.goto("/settings?tab=data");
  await expect(page.getByText("Cobertura del universo")).toBeVisible();
});

test("asset API validates input", async ({ request }) => {
  expect((await request.get("/api/asset/..%2F..%2Fetc")).status()).toBe(404);
  expect((await request.get("/api/asset/NOPE123")).status()).toBe(404);
  const ok = await request.get("/api/asset/X412");
  expect(ok.status()).toBe(200);
  expect(ok.headers()["cache-control"]).toContain("no-store");
});
