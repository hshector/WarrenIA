import { expect, test } from "@playwright/test";

// Phone behaviour that emulation can check. Touch feel itself still needs a real device.

test("inputs are 16px on touch screens (no iOS focus zoom)", async ({ page }) => {
  await page.goto("/radar");
  const size = await page.getByPlaceholder(/Buscar/).evaluate((el) => getComputedStyle(el).fontSize);
  expect(size).toBe("16px");
});

test("filters open as a bottom sheet and close with a downward drag", async ({ page }) => {
  await page.goto("/radar");
  await page.getByRole("button", { name: "Filtros" }).click();
  const sheet = page.getByRole("dialog", { name: "Filtros" });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(500); // let the enter animation finish before measuring
  const box = (await sheet.boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(page.viewportSize()!.height - 2); // anchored to the bottom

  const x = box.x + box.width / 2;
  const y = box.y + 14; // the grabber / title strip
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x, y + i * 60);
  await page.mouse.up();
  await expect(sheet).toBeHidden();
});

test("a short drag snaps the sheet back", async ({ page }) => {
  await page.goto("/radar");
  await page.getByRole("button", { name: "Filtros" }).click();
  const sheet = page.getByRole("dialog", { name: "Filtros" });
  await page.waitForTimeout(500);
  const box = (await sheet.boundingBox())!;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + 14);
  await page.mouse.down();
  await page.waitForTimeout(300); // slow, so it is not a flick
  await page.mouse.move(x, box.y + 30, { steps: 4 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await expect(sheet).toBeVisible();
});

test("delete asks in an in-app dialog and confirms with a toast", async ({ page }) => {
  const name = `Borrable ${Date.now()}`;
  await page.goto("/portfolio/transactions");
  await page.getByRole("button", { name: "Instrumento" }).first().click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Fuente de precio").selectOption("manual");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Instrumento guardado")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden(); // success closes the sheet

  let nativeDialog = false;
  page.on("dialog", () => (nativeDialog = true));
  await page.getByRole("button", { name: `Borrar ${name}` }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Borrar" }).click();
  await expect(page.getByText("Instrumento borrado")).toBeVisible();
  await expect(page.getByRole("button", { name: `Borrar ${name}` })).toHaveCount(0);
  expect(nativeDialog).toBe(false);
});
