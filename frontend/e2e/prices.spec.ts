import { expect, test } from "@playwright/test";

test.describe("/prices compare flow", () => {
  test.skip(process.env.AAF_LEGACY_PRICING_E2E !== "YES", "Legacy pricing suite is opt-in and requires the configured API and owner session.");

  test.beforeEach(async ({ context }) => {
    const owner = "11111111-1111-4111-8111-111111111111";
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ sub: owner, exp: expiresAt })).toString("base64url");
    const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${payload}.test-signature`;
    await context.addCookies([{ name: "sb-127-auth-token", value: JSON.stringify({
      access_token: token, refresh_token: "test-refresh", token_type: "bearer",
      expires_at: expiresAt, expires_in: 3600,
      user: { id: owner, aud: "authenticated", role: "authenticated", email: "owner@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-20T12:00:00.000Z" },
    }), url: "http://127.0.0.1:3100" }]);
  });
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
