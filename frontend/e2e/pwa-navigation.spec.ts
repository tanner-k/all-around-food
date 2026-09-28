import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 393, height: 852 } });

test("mobile tab bar shows exactly the four sections", async ({ page }) => {
  await page.goto("/app#/plan");
  const tabs = page.locator('nav[aria-label="Mobile navigation"]').getByRole("link");
  await expect(tabs).toHaveCount(4);
  await expect(tabs).toHaveText([/Plan/, /Cookbook/, /Shop/, /Pantry/]);
});

test("header Settings link reaches settings in one tap on mobile", async ({ page }) => {
  await page.goto("/app#/plan");
  await expect(page.getByRole("link", { name: "Previous week" })).toBeVisible();
  await page.locator("header").getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/app#\/settings$/);
  await expect(page.getByRole("heading", { name: "Back up your kitchen" })).toBeVisible();
  await expect(page.locator("header").getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
});

test("header add menu reaches import in one interaction on mobile", async ({ page }) => {
  await page.goto("/app#/shop");
  await page.locator("header").getByRole("button", { name: "Add or import a recipe" }).click();
  await expect(page.getByRole("menuitem", { name: "Add recipe" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Import recipe" }).click();
  await expect(page).toHaveURL(/\/app#\/import$/);
  await expect(page.getByRole("link", { name: "Enter a recipe manually" })).toBeVisible();
});
