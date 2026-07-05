import { expect, test } from "@playwright/test";

test("omits the deferred pricing surface from navigation", async ({ page }) => {
  await page.goto("/plan");

  await expect(page.getByRole("link", { name: /prices/i })).toHaveCount(0);
});
