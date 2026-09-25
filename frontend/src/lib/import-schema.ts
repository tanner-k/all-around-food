import { z } from "zod";
import { RecipeSchema } from "@/lib/recipe-schema";
import { RecipeDraftSchema } from "@/lib/local/schema";

/** Validate the remote result before committing a local draft. */
export const ImportDraftSchema = RecipeDraftSchema.refine(
  (draft) => draft.recipe.id === draft.id,
  { message: "Import recipe ID does not match job ID" }
);

const DoneJobSchema = z.object({
  id: z.string().uuid(),
  status: z.literal("done"),
  result_recipe_json: RecipeSchema,
  result_warnings: z.array(z.string()),
  updated_at: z.string().datetime({ offset: true }),
});

export function importDraftFromJob(job: unknown): z.infer<typeof ImportDraftSchema> {
  const result = DoneJobSchema.parse(job);
  return ImportDraftSchema.parse({
    id: result.id,
    recipe: result.result_recipe_json,
    warnings: result.result_warnings,
    received_at: result.updated_at,
  });
}
