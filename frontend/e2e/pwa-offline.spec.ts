import { expect, test, chromium } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const recipeId = "offline-recipe-1";
const recipe = {
  id: recipeId, title: "Offline Soup", description: null, source_url: null,
  source_attribution: null, prep_time_min: null, cook_time_min: null,
  total_time_min: null, servings: null, yield_text: null,
  ingredients: [{ name: "Carrot", quantity: { value: 1, unit: null, as_written: "1" }, preparation: null, optional: false, group: null, notes: null }],
  steps: [{ order: 1, instruction: "Simmer carrots.", duration_min: null, temperature_f: null, equipment: [], inline_amounts: [] }],
  equipment: [], cuisine: null, course: null, dietary_tags: [], difficulty: null,
  nutrition: null, notes: null, storage_instructions: null,
  created_at: "2026-01-01T00:00:00.000Z", times_made: 0, parse_confidence: null,
};
const backup = JSON.stringify({
  format: "all-around-food", version: 1, exported_at: "2026-01-01T00:00:00.000Z",
  library: { recipes: [recipe], meal_plans: [], shopping: [], pantry: [], cook_progress: [], drafts: [], settings: [] },
});

test("protected preview installs with its session and rejects a sign-in redirect", async ({ baseURL }) => {
  const upstream = new URL(baseURL!);
  let redirectAsset = false;
  let redirected = 0;
  const proxy = createServer((incoming, outgoing) => {
    if (!incoming.headers.cookie?.includes("preview_session=ok") ||
        (redirectAsset && incoming.url?.startsWith("/icons/icon-192.png"))) {
      // Count the worker's fetch, not an earlier browser icon request.
      if (incoming.headers["sec-fetch-dest"] === "empty") redirected++;
      outgoing.writeHead(302, { location: "/signin" }).end();
      return;
    }
    const forwarded = httpRequest(upstream, {
      method: incoming.method,
      path: incoming.url,
      headers: { ...incoming.headers, host: upstream.host },
    }, (response) => {
      outgoing.writeHead(response.statusCode!, response.headers);
      response.pipe(outgoing);
    });
    forwarded.on("error", () => outgoing.writeHead(502).end());
    incoming.pipe(forwarded);
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  if (!address || typeof address === "string") throw new Error("Proxy address unavailable");
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ baseURL: origin });
    try {
      await context.addCookies([{ name: "preview_session", value: "ok", url: origin }]);
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto("/app#/settings");
      await expect(page.getByRole("status", { name: "Offline ready" })).toBeVisible();
      expect(await page.evaluate(async () => (await caches.keys()).some((name) => name.startsWith("aaf-shell-")))).toBe(true);
    } finally {
      await context.close();
    }
    redirectAsset = true;
    const rejected = await browser.newContext({ baseURL: origin });
    try {
      await rejected.addCookies([{ name: "preview_session", value: "ok", url: origin }]);
      const page = await rejected.newPage();
      await page.goto("/app#/settings");
      await expect.poll(() => redirected).toBeGreaterThan(0);
      await expect.poll(() => page.evaluate(async () => caches.keys())).toEqual([]);
      await expect(page.getByRole("status", { name: "Offline ready" })).toHaveCount(0);
    } finally {
      await rejected.close();
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});

test("installed shell opens an unvisited recipe offline and recovers online after cache eviction", async ({ baseURL }) => {
  const profile = await mkdtemp(join(tmpdir(), "aaf-pwa-"));
  let context = await chromium.launchPersistentContext(profile, { headless: true, baseURL });
  try {
    let page = context.pages()[0] ?? await context.newPage();
    await page.goto("/app#/settings");
    await expect(page.getByRole("status", { name: "Offline ready" })).toBeVisible();
    await page.locator("#restore-file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup) });
    await page.getByRole("button", { name: "Merge backup" }).click();
    await expect(page.getByText("Completed and verified.")).toBeVisible();
    await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve) => {
      const request = indexedDB.open("aaf-local");
      request.onsuccess = () => {
        const db = request.result;
        const marker = db.transaction("settings").objectStore("settings").get("storage_persistence_requested");
        marker.onsuccess = () => { resolve(Boolean(marker.result)); db.close(); };
        marker.onerror = () => { resolve(false); db.close(); };
      };
      request.onerror = () => resolve(false);
    }))).toBe(true);
    await context.close();

    context = await chromium.launchPersistentContext(profile, { headless: true, baseURL, offline: true });
    page = context.pages()[0] ?? await context.newPage();
    await page.goto("/app#/cookbook", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Offline Soup")).toBeVisible();
    await page.goto(`/app#/cookbook/${recipeId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Offline Soup" })).toBeVisible();
    await page.goto(`/app#/cookbook/${recipeId}/edit`, { waitUntil: "domcontentloaded" });
    await page.locator("section").filter({ has: page.getByRole("heading", { name: "Basic info" }) }).locator("input").first().fill("Offline Soup Updated");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Offline Soup Updated" })).toBeVisible();
    await page.goto(`/cookbook/${recipeId}/cook`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/app#/cookbook/${recipeId}/cook$`));
    await expect(page.getByText("Simmer carrots.").last()).toBeVisible();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/app#\/plan$/);
    await context.setOffline(false);
    await page.evaluate(async () => {
      const name = (await caches.keys()).find((key) => key.startsWith("aaf-shell-"));
      if (!name) throw new Error("Installed release cache missing");
      const cache = await caches.open(name);
      if (!(await cache.delete("/app")) || !(await cache.delete("/icons/icon-192.png"))) {
        throw new Error("Required cache entries were not present before eviction");
      }
    });
    expect(await page.evaluate(async () => (await fetch("/icons/icon-192.png")).ok)).toBe(true);
    await page.goto(`/app#/cookbook/${recipeId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Offline Soup Updated" })).toBeVisible();
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("failed update keeps the old release; accepted update keeps local recipes", async ({ baseURL }) => {
  const manifestPath = join(process.cwd(), "public/assets/pwa-precache.js");
  const original = await readFile(manifestPath, "utf8");
  const release = JSON.parse(original.slice("self.__PWA_PRECACHE = ".length, -2)) as { buildId: string; assets: string[] };
  const previousOnlyAsset = release.assets.find((asset) => asset.endsWith("/_buildManifest.js"));
  if (!previousOnlyAsset) throw new Error("Build manifest asset missing from precache");
  const profile = await mkdtemp(join(tmpdir(), "aaf-update-"));
  const context = await chromium.launchPersistentContext(profile, { headless: true, baseURL });
  const page = context.pages()[0] ?? await context.newPage();
  const writeRelease = (buildId: string, assets: string[]) =>
    writeFile(manifestPath, `self.__PWA_PRECACHE = ${JSON.stringify({ buildId, assets })};\n`);
  try {
    await page.goto("/app#/settings");
    await expect(page.getByRole("status", { name: "Offline ready" })).toBeVisible();
    await page.locator("#restore-file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup) });
    await page.getByRole("button", { name: "Merge backup" }).click();
    await expect(page.getByText("Completed and verified.")).toBeVisible();

    await writeRelease(`${release.buildId}-bad`, [...release.assets, "/assets/missing-required-file.js"]);
    const failedState = page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("Service worker not registered");
      const outcome = new Promise<string>((resolve) => registration.addEventListener("updatefound", () => {
        const worker = registration.installing!;
        worker.addEventListener("statechange", () => {
          if (worker.state === "redundant") resolve(worker.state);
        });
      }, { once: true }));
      await registration.update();
      return outcome;
    });
    expect(await failedState).toBe("redundant");
    await expect(page.getByText("Update available")).toHaveCount(0);
    await page.context().setOffline(true);
    await page.reload();
    await page.goto(`/app#/cookbook/${recipeId}`);
    await expect(page.getByRole("heading", { name: "Offline Soup" })).toBeVisible();

    await page.context().setOffline(false);
    await writeRelease(`${release.buildId}-good`, release.assets.filter((asset) => asset !== previousOnlyAsset));
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
    await expect(page.getByText("Update available")).toBeVisible();
    await page.goto(`/app#/cookbook/${recipeId}/cook`);
    await expect(page.getByText("Simmer carrots.").last()).toBeVisible();
    await page.evaluate(() => { (window as Window & { pwaPageToken?: string }).pwaPageToken = "cooking"; });
    await page.getByRole("button", { name: "Update now" }).click();
    await expect(page.getByText("Update installed. Reload when you are ready.")).toBeVisible();
    expect(await page.evaluate(() => (window as Window & { pwaPageToken?: string }).pwaPageToken)).toBe("cooking");
    await page.context().setOffline(true);
    let cachesLeft = await page.evaluate(() => caches.keys());
    expect(cachesLeft).toContain(`aaf-shell-${release.buildId}`);
    expect(cachesLeft).toContain(`aaf-shell-${release.buildId}-good`);
    expect(await page.evaluate((asset) => fetch(asset).then((response) => response.ok), previousOnlyAsset)).toBe(true);
    await page.goto(`/app#/cookbook/${recipeId}`);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Offline Soup" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain(`aaf-shell-${release.buildId}`);
    cachesLeft = await page.evaluate(() => caches.keys());
    expect(cachesLeft).toContain(`aaf-shell-${release.buildId}-good`);
  } finally {
    await writeFile(manifestPath, original);
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
