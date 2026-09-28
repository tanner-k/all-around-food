import { expect, test, type Page } from "@playwright/test";

// Dark `--color-bg` (#1C1512) as the browser reports it.
const DARK_BG = "rgb(28, 21, 18)";

const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("stored dark preference applies before the app renders", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("aaf-theme", "dark"));
  await page.goto("/app#/plan");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bodyBackground(page)).toBe(DARK_BG);
});

test("system preference resolves to the device color scheme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/app#/plan");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bodyBackground(page)).toBe(DARK_BG);

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bodyBackground(page)).not.toBe(DARK_BG);
});

test("choosing Dark in Settings persists across reloads and offline", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/app#/settings");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

  await expect(page.getByRole("status", { name: "Offline ready" })).toBeVisible();
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bodyBackground(page)).toBe(DARK_BG);
  await page.context().setOffline(false);
});

test("without JavaScript the CSS media fallback still paints dark", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, colorScheme: "dark" });
  try {
    const page = await context.newPage();
    await page.goto("/app#/plan");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
    expect(await bodyBackground(page)).toBe(DARK_BG);
  } finally {
    await context.close();
  }
});
