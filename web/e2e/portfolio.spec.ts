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

test("Trade Republic CSV is recognised: catalog ETF and US stock found by name", async ({ page }) => {
  const H =
    '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"';
  const r = (d: string, cat: string, type: string, cls: string, name: string, isin: string, sh: string, px: string, amt: string, fee: string, id: string) =>
    `"${d}T08:00:00.000Z","${d}","DEFAULT","${cat}","${type}","${cls}","${name}","${isin}","${sh}","${px}","${amt}","${fee}","","EUR","","","","","${id}","","","",""`;
  const csv = [
    H,
    r("2026-03-09", "CASH", "CUSTOMER_INBOUND", "", "", "", "", "", "1000.00", "", "a1"),
    r("2026-03-10", "TRADING", "SAVINGS_PLAN_EXECUTED", "FUND", "Vanguard FTSE All-World (Acc)", "IE00BK5BQT80", "2.0000000000", "120.000000", "-240.00", "0.00", "a2"),
    r("2026-03-11", "TRADING", "BUY", "STOCK", "Demo Materials 682", "US0000006826", "1.0000000000", "50.000000", "-50.00", "-1.00", "a3"),
    r("2026-03-12", "DELIVERY", "MIGRATION", "STOCK", "Other Corp", "US0000000018", "3.0000000000", "", "", "", "a4"),
  ].join("\n");
  await page.goto("/portfolio/import");
  await page.locator("textarea").fill(csv);
  await page.getByRole("button", { name: "Preview and check" }).click();
  await expect(page.getByText("Trade Republic export recognised")).toBeVisible();
  await expect(page.getByText("3 valid · 1 with errors")).toBeVisible();
  await expect(page.getByText(/price you originally paid/)).toBeVisible();
  await expect(page.getByText(/Core · price from your trades/)).toBeVisible();
  await expect(page.getByText(/US stock X682, priced daily/)).toBeVisible();
  await page.getByRole("button", { name: /Import 3 valid rows/ }).click();
  await expect(page.getByText(/3 transactions imported/)).toBeVisible();
  await page.goto("/portfolio/transactions");
  await expect(page.getByText("Vanguard FTSE All-World UCITS ETF (USD) Accumulating").first()).toBeVisible();
});
