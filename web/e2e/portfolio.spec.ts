import { expect, test } from "@playwright/test";
import { rmSync } from "node:fs";
import path from "node:path";

test.beforeAll(() => {
  rmSync(path.resolve(process.cwd(), "test-results", "e2e-user.json"), { force: true });
});

test.describe.configure({ mode: "serial" });

test("empty portfolio offers onboarding; home shows the contribution split", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page.getByText("Your portfolio is empty")).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Your next contribution")).toBeVisible();
});

test("register instrument, deposit and buy; oversell is rejected", async ({ page }) => {
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Instrument" }).click();
  await page.getByLabel("Name").fill("Núcleo de prueba (SPY)");
  await page.getByLabel("Price source").selectOption("us_market");
  await page.getByLabel("US ticker").fill("SPY");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Instrument saved")).toBeVisible();
  await page.keyboard.press("Escape");

  const addTx = async (fill: (p: ReturnType<typeof page.getByRole>) => Promise<void>) => {
    await page.getByRole("button", { name: "Transaction" }).click();
    const d = page.getByRole("dialog");
    await fill(d);
    await d.getByRole("button", { name: "Save" }).click();
  };
  await addTx(async (p) => {
    await p.getByLabel("Type").selectOption("deposit");
    await p.getByLabel("Date").fill("2026-03-02");
    await p.getByLabel("Amount", { exact: true }).fill("1000");
  });
  await expect(page.getByText("Transaction saved")).toBeVisible();
  await page.keyboard.press("Escape");

  await addTx(async (p) => {
    await p.getByLabel("Type").selectOption("buy");
    await p.getByLabel("Date").fill("2026-03-02");
    await p.getByLabel("Units").fill("1.5");
    await p.getByLabel("Price per unit").fill("500");
    await p.getByLabel("Fee").fill("1");
  });
  await expect(page.getByText("Transaction saved")).toBeVisible();
  await page.keyboard.press("Escape");

  await addTx(async (p) => {
    await p.getByLabel("Type").selectOption("sell");
    await p.getByLabel("Date").fill("2026-04-01");
    await p.getByLabel("Units").fill("5");
    await p.getByLabel("Price per unit").fill("500");
  });
  await expect(page.getByText(/Sale of 5 units/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByText("Total value")).toBeVisible();
  await expect(page.getByText("Núcleo de prueba (SPY)", { exact: true })).toBeVisible();
  await expect(page.getByText("Return on your money")).toBeVisible();
});

test("CSV import: preview, validation errors, idempotent re-import", async ({ page }) => {
  const csv = ["fecha;tipo;ticker;nombre;cantidad;precio;importe;comision;divisa", "05/03/2026;aportación;;;;;200;;EUR", "06/03/2026;compra;SPY;;0,1;510;;;EUR", "07/03/2026;compra;;;1;10;;;EUR"].join("\n");
  await page.goto("/portfolio/import");
  await page.locator("textarea").fill(csv);
  await page.getByRole("button", { name: "Preview and check" }).click();
  await expect(page.getByText("2 valid · 1 with errors")).toBeVisible();
  await expect(page.getByText("Missing ISIN or ticker")).toBeVisible();
  await page.getByRole("button", { name: /Import 2 valid rows/ }).click();
  await expect(page.getByText(/2 transactions imported/)).toBeVisible();
  await page.getByRole("button", { name: /Import 2 valid rows/ }).click();
  await expect(page.getByText(/0 transactions imported · 2 already existed/)).toBeVisible();
  await page.goto("/portfolio/transactions");
  await expect(page.getByText("Transactions (4)")).toBeVisible();
});
