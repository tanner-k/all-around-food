import { expect, test } from "@playwright/test";
import { recipeFixture } from "../src/lib/__tests__/fixtures/recipe";
const owner = "11111111-1111-4111-8111-111111111111";
// A retained, previously verified local identity exercises device UI only; this is not hosted Auth proof.
for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
  test(`recipe copy backups, choices and offline deletion fit ${viewport.width}px`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(id => localStorage.setItem("aaf-verified-local-owner", id), owner);
    await page.goto("/app#/settings");
    await expect(page.getByRole("button", { name: "Download local backup" })).toBeEnabled();
    await expect(page.getByRole("status", { name: "Offline ready" })).toBeVisible();
    const accountRecipe = { ...recipeFixture(), title: "Account Toast" };
    await page.evaluate(async ({ owner, recipe }) => {
      await new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open(`aaf-local:${owner}`);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction("recipes", "readwrite"); tx.objectStore("recipes").put(recipe);
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); };
        };
      });
    }, { owner, recipe: accountRecipe });
    const source = { format: "all-around-food", version: 1, exported_at: new Date().toISOString(), library: { recipes: [{ ...accountRecipe, title: "Source Toast" }], meal_plans: [{ dangling: "ignored" }], shopping: [], pantry: [], cook_progress: [], drafts: [], settings: [] } };
    await context.setOffline(true);
    await page.getByLabel("Review recipes from a backup file").setInputFiles({ name: "source.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(source)) });
    await expect(page.getByText("Same recipe ID, different content")).toBeVisible();
    await page.getByText("Compare recipe versions").click();
    await expect(page.getByText("Account Toast", { exact: true })).toBeVisible();
    await page.getByLabel("Version for Source Toast").selectOption("source");
    const copy = page.getByRole("button", { name: "Copy reviewed recipes" }); await expect(copy).toBeDisabled();
    for (const label of ["Download source backup", "Download account backup before copy"]) {
      const download = page.waitForEvent("download"); await page.getByRole("button", { name: label }).click(); await download;
    }
    await page.getByRole("checkbox", { name: /saved both backup files/ }).check();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await copy.boundingBox(); expect(bounds?.height).toBeGreaterThanOrEqual(44); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    await copy.click(); await expect(page.getByText(/1 recipes copied, 0 kept, 1 recipe changes/)).toBeVisible();
    await page.goto(`/app#/cookbook/${accountRecipe.id}`);
    await expect(page.getByRole("heading", { name: "Source Toast" })).toBeVisible();
    await page.getByRole("button", { name: "Recipe options" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete recipe?" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Your cookbook is empty. Add a recipe to get started.")).toBeVisible();
    const groups = await page.evaluate(async owner => new Promise<unknown[]>((resolve, reject) => {
      const opening = indexedDB.open(`aaf-local:${owner}`); opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => { const db = opening.result; const tx = db.transaction("sync_outbox"); const request = tx.objectStore("sync_outbox").getAll(); tx.oncomplete = () => { db.close(); resolve(request.result); }; tx.onabort = () => { db.close(); reject(tx.error); }; };
    }), owner);
    expect(groups).toHaveLength(2);
  });
}
