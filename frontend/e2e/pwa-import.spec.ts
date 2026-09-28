import { expect, test } from "@playwright/test";
import type { RemoteRecord } from "../src/lib/local/sync-codecs";
import type { PushRequest } from "../src/lib/db/librarySync";

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
  let revision = 0;
  let holdNextPull = false;
  let notifyPullStarted!: () => void;
  let releasePull!: () => void;
  const pullStarted = new Promise<void>(resolve => { notifyPullStarted = resolve; });
  const pullReleased = new Promise<void>(resolve => { releasePull = resolve; });
  const records = new Map<string, RemoteRecord>();
  const journal: { revision: number; records: RemoteRecord[] }[] = [];
  const receipts = new Map<string, { status: "accepted"; revision: number; records: RemoteRecord[] }>();
  const pushes: PushRequest[] = [];
  function publish(changes: Pick<RemoteRecord, "kind" | "entity_id" | "payload" | "deleted">[]) {
    const rows = changes.map(change => ({ ...change, revision: revision + 1, schema_version: 1 as const, updated_at: now }));
    revision++;
    for (const row of rows) records.set(`${row.kind}:${row.entity_id}`, row);
    journal.push({ revision, records: structuredClone(rows) });
    return rows;
  }
  function job() {
    return { id: submittedId, user_id: owner, kind: "text", source_url: null, storage_path: null, payload_text: "Toast the bread.",
      status: "done", attempts: 1, error: null, result_recipe_id: null,
      // Queue result content differs deliberately; review content must arrive through the journal.
      result_recipe_json: submittedId ? { ...recipe(submittedId), title: "Unused legacy result" } : null,
      result_warnings: [], lease_until: null, claim_token: null, acknowledged_at: acknowledged ? now : null,
      expires_at: "2099-01-01T00:00:00.000Z", created_at: now, updated_at: now };
  }
  await page.route("https://aaf-mock.supabase.co/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/auth/v1/user") {
      await reply({ id: owner, aud: "authenticated", role: "authenticated", email: "owner@example.test", app_metadata: {}, user_metadata: {}, created_at: now }); return;
    }
    if (url.pathname === "/rest/v1/parse_jobs") {
      if (request.method() === "POST") {
        const input = request.postDataJSON(); expect(input.user_id).toBe(owner);
        if (!submittedId) {
          submittedId = input.id;
          publish([{ kind: "draft", entity_id: submittedId!, deleted: false, payload: { id: submittedId, recipe: recipe(submittedId!), warnings: ["Check servings"], received_at: now } }]);
        }
        await reply(job());
      } else if (url.searchParams.has("id")) { await reply(job()); }
      else { expect(url.searchParams.get("user_id")).toBe(`eq.${owner}`); await reply(submittedId ? [job()] : []); }
      return;
    }
    if (url.pathname === "/rest/v1/rpc/pull_library_changes") {
      const after = request.postDataJSON().p_after_revision;
      if (holdNextPull) {
        holdNextPull = false;
        notifyPullStarted();
        await pullReleased;
      }
      const batches = journal.filter(batch => batch.revision > after);
      await reply({ protocol_version: 1, batches, next_revision: batches.at(-1)?.revision ?? after, has_more: false }); return;
    }
    if (url.pathname === "/rest/v1/rpc/push_library_changes") {
      const input = request.postDataJSON().p_request as PushRequest;
      let receipt = receipts.get(input.mutation_id);
      if (!receipt) {
        for (const change of input.changes) expect(change.base_revision).toBe(records.get(`${change.kind}:${change.entity_id}`)?.revision ?? null);
        pushes.push(structuredClone(input)); const rows = publish(input.changes);
        receipt = { status: "accepted", revision, records: rows }; receipts.set(input.mutation_id, receipt);
      }
      await reply(receipt); return;
    }
    if (url.pathname === "/rest/v1/rpc/ack_import_job") {
      expect(request.postDataJSON().p_id).toBe(submittedId); acknowledged = true; await reply(job()); return;
    }
    await route.abort();
  });

  await page.goto("/app#/import");
  await expect(page.getByRole("link", { name: "Enter a recipe manually" })).toBeVisible();
  await expect(page.getByText("Up to date", { exact: true })).toBeVisible();
  await expect(page.locator("#app-header-status").getByRole("link", { name: "Up to date" })).toHaveAttribute("href", "/app#/settings");
  expect(await page.evaluate(() => localStorage.getItem("aaf-verified-local-owner"))).toBe(owner);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.getByLabel("Recipe text").fill("Toast the bread.");
  await page.getByRole("button", { name: "Import pasted text" }).click();
  await expect(page.getByText("Waiting to send")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Waiting to send")).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => submittedId).not.toBeNull();
  // Sync now lives in Settings; hash navigation keeps the same app session.
  await page.evaluate(() => { window.location.hash = "#/settings"; });
  await page.getByRole("button", { name: "Sync now" }).click();
  await page.evaluate(() => { window.location.hash = "#/import"; });
  await expect(page.getByText("Check servings")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Unused legacy result")).toHaveCount(0);
  await expect.poll(() => acknowledged).toBe(true);
  await page.goto("/app#/cookbook");
  await expect(page.getByText("Your cookbook is empty. Add a recipe to get started.")).toBeVisible();

  await page.goto("/app#/import");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Recipe title").fill("My Toast");
  await expect(page.getByText("All changes saved locally")).toBeVisible();
  // Save after this pass took its outbox snapshot, while its pull is still in flight.
  holdNextPull = true;
  await page.reload();
  await pullStarted;
  await expect(page.getByRole("heading", { name: "My Toast" })).toBeVisible();
  await page.evaluate(() => { window.location.hash = "#/settings"; });
  await expect(page.getByRole("button", { name: "Syncing…" })).toBeDisabled();
  await page.evaluate(() => { window.location.hash = "#/import"; });
  await expect(page.getByRole("heading", { name: "My Toast" })).toBeVisible();
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await expect(page).toHaveURL(/#\/cookbook\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "My Toast" })).toBeVisible();
  expect(records.get(`recipe:${submittedId}`)).toBeUndefined();
  releasePull();
  await page.goto("/app#/cookbook");
  await expect(page.getByRole("link", { name: /My Toast/ })).toBeVisible();
  // A save during a busy pass is sent by the next 30s foreground poll.
  await expect.poll(() => records.get(`recipe:${submittedId}`)?.payload, { timeout: 45_000 }).toMatchObject({ title: "My Toast" });
  await expect.poll(() => records.get(`draft:${submittedId}`)?.deleted).toBe(true);
  expect(pushes.some(input => input.changes.length === 2 && input.changes.some(change => change.kind === "recipe" && !change.deleted) && input.changes.some(change => change.kind === "draft" && change.deleted && change.base_revision !== null))).toBe(true);
});
