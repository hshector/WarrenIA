import { expect, test } from "@playwright/test";

// Phone behaviour that emulation can check. Touch feel itself still needs a real device.

test("inputs are 16px on touch screens (no iOS focus zoom)", async ({ page }) => {
  await page.goto("/radar");
  const size = await page.getByPlaceholder(/Search/).evaluate((el) => getComputedStyle(el).fontSize);
  expect(size).toBe("16px");
});

test("filters open as a bottom sheet and close with a downward drag", async ({ page }) => {
  await page.goto("/radar");
  await page.getByRole("button", { name: "Filters" }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
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
  await page.getByRole("button", { name: "Filters" }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
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
  await page.getByRole("button", { name: "Instrument" }).first().click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Price source").selectOption("manual");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Instrument saved")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden(); // success closes the sheet

  let nativeDialog = false;
  page.on("dialog", () => (nativeDialog = true));
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Instrument deleted")).toBeVisible();
  await expect(page.getByRole("button", { name: `Delete ${name}` })).toHaveCount(0);
  expect(nativeDialog).toBe(false);
});

test("Ajustes → Apariencia switches to dark, persists and recolours the status bar", async ({ page }) => {
  await page.goto("/settings");
  const html = page.locator("html");
  const picker = page.getByRole("tablist", { name: "Appearance" });
  await expect(picker.getByRole("tab", { name: "Automatic" })).toHaveAttribute("aria-selected", "true");

  await picker.getByRole("tab", { name: "Dark" }).click();
  await expect(html).toHaveClass(/\bdark\b/);
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#000000");
  const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(canvas).toBe("rgb(0, 0, 0)");

  await page.reload();
  await expect(html).toHaveClass(/\bdark\b/); // remembered on this device
  await expect(page.getByRole("tablist", { name: "Appearance" }).getByRole("tab", { name: "Dark" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tablist", { name: "Appearance" }).getByRole("tab", { name: "Light" }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#f3f4f1");
});

test("Automatic follows the phone's dark mode", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "dark", viewport: { width: 412, height: 839 } });
  const page = await ctx.newPage();
  await page.goto("/radar");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await ctx.close();
});
