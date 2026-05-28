import { expect, test } from "@playwright/test";

test.describe("/prices compare flow", () => {
  test("searches by ZIP, compares retailer prices, and renders history", async ({ page }) => {
    await page.goto("/prices?zip=84065&q=milk");

    await expect(page.getByRole("heading", { name: /grocery price comparison/i })).toBeVisible();
    await expect(page.getByLabel("ZIP code")).toHaveValue("84065");
    await expect(page.getByRole("link", { name: /dairy best whole milk/i })).toBeVisible();

    await page.getByRole("link", { name: /dairy best whole milk/i }).click();

    await expect(page).toHaveURL(/id=milk-whole-gallon/);
    await expect(page.getByRole("cell", { name: "kroger", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: /\$2\.99/ })).toContainText("★");
    await expect(page.locator(".recharts-wrapper")).toBeVisible();
  });

  test("validates ZIP input and shows the empty ZIP state", async ({ page }) => {
    await page.goto("/prices");
    await expect(page.getByText(/enter a 5-digit zip code above/i)).toBeVisible();

    await page.getByLabel("ZIP code").fill("1234");
    await page.getByRole("button", { name: /set zip/i }).click();

    await expect(page.getByText("Enter a 5-digit ZIP code.")).toBeVisible();
    await expect(page).toHaveURL(/\/prices$/);
  });
});
