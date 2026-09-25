import { expect, it } from "vitest";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { importDraftFromJob } from "@/lib/import-schema";

it("validates a done result and binds its recipe ID to the job ID", () => {
  const recipe = recipeFixture();
  const job = {
    id: "00000000-0000-4000-8000-000000000001",
    status: "done",
    result_recipe_json: { ...recipe, id: "other-id" },
    result_warnings: ["Review amount"],
    updated_at: "2026-09-20T00:00:00Z",
  };
  expect(() => importDraftFromJob(job)).toThrow();
  expect(importDraftFromJob({
    ...job, result_recipe_json: { ...recipe, id: job.id },
  }).recipe.id).toBe(job.id);
});

it("accepts a PostgREST timestamp with a UTC offset", () => {
  const recipe = recipeFixture();
  const job = {
    id: "00000000-0000-4000-8000-000000000001",
    status: "done",
    result_recipe_json: { ...recipe, id: "00000000-0000-4000-8000-000000000001" },
    result_warnings: [],
    updated_at: "2026-09-20T12:00:00+00:00",
  };

  expect(importDraftFromJob(job).received_at).toBe(job.updated_at);
});
