import { expect, test } from "@playwright/test";
import { rmSync } from "node:fs";
import path from "node:path";

test.beforeAll(() => {
  rmSync(path.resolve(process.cwd(), "test-results", "e2e-user.json"), { force: true });
});

test.describe.configure({ mode: "serial" });

test("empty portfolio offers onboarding and a contribution split", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page.getByText("Empieza tu cartera")).toBeVisible();
  await expect(page.getByText("Reparto de tu próxima aportación")).toBeVisible();
});

test("register instrument, deposit and buy; oversell is rejected", async ({ page }) => {
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Instrumento" }).click();
  await page.getByLabel("Nombre").fill("Núcleo de prueba (SPY)");
  await page.getByLabel("Fuente de precio").selectOption("us_market");
  await page.getByLabel("Ticker EE. UU.").fill("SPY");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Instrumento guardado")).toBeVisible();
  await page.keyboard.press("Escape");

  const addTx = async (fill: (p: ReturnType<typeof page.getByRole>) => Promise<void>) => {
    await page.getByRole("button", { name: "Operación" }).click();
    const d = page.getByRole("dialog");
    await fill(d);
    await d.getByRole("button", { name: "Guardar" }).click();
  };
  await addTx(async (p) => {
    await p.getByLabel("Tipo").selectOption("deposit");
    await p.getByLabel("Fecha").fill("2026-03-02");
    await p.getByLabel("Importe", { exact: true }).fill("1000");
  });
  await expect(page.getByText("Operación registrada")).toBeVisible();
  await page.keyboard.press("Escape");

  await addTx(async (p) => {
    await p.getByLabel("Tipo").selectOption("buy");
    await p.getByLabel("Fecha").fill("2026-03-02");
    await p.getByLabel("Unidades").fill("1,5");
    await p.getByLabel("Precio por unidad").fill("500");
    await p.getByLabel("Comisión").fill("1");
  });
  await expect(page.getByText("Operación registrada")).toBeVisible();
  await page.keyboard.press("Escape");

  await addTx(async (p) => {
    await p.getByLabel("Tipo").selectOption("sell");
    await p.getByLabel("Fecha").fill("2026-04-01");
    await p.getByLabel("Unidades").fill("5");
    await p.getByLabel("Precio por unidad").fill("500");
  });
  await expect(page.getByText(/Venta de 5 unidades/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByText("Valor actual").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /Núcleo de prueba/ })).toBeVisible();
  await expect(page.getByText("TWR").first()).toBeVisible();
});

test("CSV import: preview, validation errors, idempotent re-import", async ({ page }) => {
  const csv = ["fecha;tipo;ticker;nombre;cantidad;precio;importe;comision;divisa", "05/03/2026;aportación;;;;;200;;EUR", "06/03/2026;compra;SPY;;0,1;510;;;EUR", "07/03/2026;compra;;;1;10;;;EUR"].join("\n");
  await page.goto("/portfolio/import");
  await page.locator("textarea").fill(csv);
  await page.getByRole("button", { name: "Vista previa y validación" }).click();
  await expect(page.getByText("2 válidas · 1 con errores")).toBeVisible();
  await expect(page.getByText("Falta ISIN o ticker")).toBeVisible();
  await page.getByRole("button", { name: /Importar 2 filas válidas/ }).click();
  await expect(page.getByText(/2 operaciones importadas/)).toBeVisible();
  await page.getByRole("button", { name: /Importar 2 filas válidas/ }).click();
  await expect(page.getByText(/0 operaciones importadas · 2 ya existían/)).toBeVisible();
  await page.goto("/portfolio/transactions");
  await expect(page.getByText("Operaciones (4)")).toBeVisible();
});
