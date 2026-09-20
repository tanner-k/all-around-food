import { expect, test } from "@playwright/test";

const owner = "11111111-1111-4111-8111-111111111111";
const now = "2026-09-20T12:00:00.000Z";

function recipe(id: string) {
  return {
    id, title: "Imported Toast", description: null, source_url: null,
    source_attribution: null, prep_time_min: null, cook_time_min: null,
    total_time_min: null, servings: 2, yield_text: null,
    ingredients: [{ name: "Bread", quantity: { value: 2, unit: null, as_written: "2 slices" }, preparation: null, optional: false, group: null, notes: null }],
    steps: [{ order: 1, instruction: "Toast bread.", duration_min: null, temperature_f: null, equipment: [], inline_amounts: [] }],
    equipment: [], cuisine: null, course: null, dietary_tags: [], difficulty: null,
    nutrition: null, notes: null, storage_instructions: null,
    created_at: now, times_made: 0, parse_confidence: null,
  };
}

test("an offline request resumes through mocked Supabase, survives review reload, and saves explicitly", async ({ page, context }) => {
  const payload = Buffer.from(JSON.stringify({ sub: owner, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${payload}.test-signature`;
  await context.addCookies([{ name: "sb-aaf-mock-auth-token", value: JSON.stringify({
    access_token: token, refresh_token: "test-refresh", token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
    user: { id: owner, aud: "authenticated", role: "authenticated", email: "owner@example.test", app_metadata: {}, user_metadata: {}, created_at: now },
  }), url: "http://127.0.0.1:3217" }]);

  let submittedId: string | null = null;
  let acknowledged = false;
  await page.route("https://aaf-mock.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/auth/v1/user") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: owner, aud: "authenticated", role: "authenticated", email: "owner@example.test", app_metadata: {}, user_metadata: {}, created_at: now }) });
      return;
    }
    if (url.pathname === "/rest/v1/parse_jobs") {
      if (request.method() === "POST") submittedId = request.postDataJSON().id;
      if (!submittedId) { await route.fulfill({ status: 404, body: "{}" }); return; }
      const job = {
        id: submittedId, kind: "text", source_url: null, storage_path: null, payload_text: "Toast the bread.",
        status: "done", attempts: 1, error: null, result_recipe_id: null,
        result_recipe_json: recipe(submittedId), result_warnings: ["Check servings"],
        lease_until: null, claim_token: null, acknowledged_at: acknowledged ? now : null,
        expires_at: "2099-01-01T00:00:00.000Z", created_at: now, updated_at: now,
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(job) });
      return;
    }
    if (url.pathname === "/rest/v1/rpc/ack_import_job") {
      acknowledged = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    await route.abort();
  });

  await page.goto("/app#/import");
  await expect(page.getByRole("link", { name: "Enter a recipe manually" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.getByLabel("Recipe text").fill("Toast the bread.");
  await page.getByRole("button", { name: "Import pasted text" }).click();
  await expect(page.getByText("Waiting to send")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Waiting to send")).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Check servings")).toBeVisible({ timeout: 15_000 });
  expect(submittedId).not.toBeNull();
  await expect.poll(() => acknowledged).toBe(true);
  await page.goto("/app#/cookbook");
  await expect(page.getByText("Your cookbook is empty. Add a recipe to get started.")).toBeVisible();

  await page.goto("/app#/import");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Recipe title").fill("My Toast");
  await page.reload();
  await expect(page.getByRole("heading", { name: "My Toast" })).toBeVisible();
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await expect(page.getByRole("heading", { name: "My Toast" })).toBeVisible();
  await page.goto("/app#/cookbook");
  await expect(page.getByRole("link", { name: /My Toast/ })).toBeVisible();
});
