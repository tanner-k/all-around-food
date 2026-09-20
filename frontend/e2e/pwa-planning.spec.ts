import { expect, test, chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const recipe = {
  id: "planning-eggs", title: "Eggs on toast", description: null, source_url: null,
  source_attribution: null, prep_time_min: null, cook_time_min: null, total_time_min: null,
  servings: 1, yield_text: null,
  ingredients: [{ name: "eggs", quantity: { value: 2, unit: null, as_written: "2 eggs" }, preparation: null, optional: false, group: null, notes: null }],
  steps: [{ order: 1, instruction: "Cook eggs.", duration_min: null, temperature_f: null, equipment: [], inline_amounts: [] }],
  equipment: [], cuisine: null, course: null, dietary_tags: [], difficulty: null,
  nutrition: null, notes: null, storage_instructions: null,
  created_at: "2026-01-01T00:00:00.000Z", times_made: 0, parse_confidence: null,
};
const backup = JSON.stringify({
  format: "all-around-food", version: 1, exported_at: "2026-01-01T00:00:00.000Z",
  library: { recipes: [recipe], meal_plans: [], shopping: [], pantry: [], cook_progress: [], drafts: [], settings: [] },
});

test("planner, shopping, and pantry remain usable through an offline restart", async ({ baseURL }) => {
  const profile = await mkdtemp(join(tmpdir(), "aaf-planning-"));
  let context = await chromium.launchPersistentContext(profile, { headless: true, baseURL });
  try {
    let page = context.pages()[0] ?? await context.newPage();
    await page.goto("/app#/settings");
    await expect(page.getByRole("status", { name: "Offline ready" })).toBeVisible();
    await page.locator("#restore-file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup) });
    await page.getByRole("button", { name: "Merge backup" }).click();
    await expect(page.getByText("Completed and verified.")).toBeVisible();
    await context.close();

    context = await chromium.launchPersistentContext(profile, { headless: true, baseURL, offline: true });
    page = context.pages()[0] ?? await context.newPage();
    await page.goto("/app#/plan", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Plan your week." })).toBeVisible();
    await page.getByRole("button", { name: "+ Add recipe" }).first().click();
    await page.getByRole("button", { name: "Eggs on toast", exact: true }).click();
    await page.getByRole("button", { name: "+ Add recipe" }).first().click();
    await page.getByRole("button", { name: "Eggs on toast", exact: true }).click();
    await expect(page.getByText("Eggs on toast")).toHaveCount(2);
    await page.getByRole("spinbutton", { name: "Eggs on toast servings" }).last().fill("2");
    await page.getByRole("button", { name: "Review shopping →" }).click();
    await expect(page).toHaveURL(/\/app#\/shop$/);
    await expect(page.getByText("6")).toBeVisible();
    await page.getByRole("checkbox", { name: "eggs" }).click();
    await page.getByRole("button", { name: "Mark as bought" }).click();
    await expect(page.getByText("Nothing to buy.", { exact: false })).toBeVisible();
    await page.goto("/app#/pantry", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("eggs")).toBeVisible();
    await context.close();

    context = await chromium.launchPersistentContext(profile, { headless: true, baseURL, offline: true });
    page = context.pages()[0] ?? await context.newPage();
    await page.goto("/app#/pantry", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("eggs")).toBeVisible();
    await page.goto("/app#/plan", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Eggs on toast")).toHaveCount(2);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
