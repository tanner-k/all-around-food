import { z } from "zod";
import type { MealPlan } from "@/lib/meal-plan-schema";
import type { PantryItem } from "@/lib/pantry-schema";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";
import type { ShoppingListItem } from "@/lib/shopping-schema";

export const CookProgressSchema = z.object({
  recipe_id: z.string(),
  step: z.number().int(),
  layout: z.enum(["step", "scroll"]),
  timer_end_at: z.number().nullable(),
  paused_seconds: z.number().nullable(),
  session_id: z.string().optional(),
  completed_at: z.string().nullable().optional(),
});

export const CookProgressPatchSchema = CookProgressSchema.partial().extend({
  recipe_id: CookProgressSchema.shape.recipe_id,
});

export const RecipeDraftSchema = z.object({
  id: z.string(),
  recipe: RecipeSchema,
  warnings: z.array(z.string()),
  received_at: z.string(),
});

export const LocalImportSchema = z.object({
  id: z.string(),
  owner_id: z.string().nullable(),
  kind: z.enum(["url", "video", "screenshot", "text"]),
  source_url: z.string().nullable(),
  payload_text: z.string().nullable(),
  upload: z.instanceof(Blob).nullable(),
  state: z.enum(["queued", "submitted", "draft", "saved", "error", "replaced"]),
  acknowledged: z.boolean(),
  error: z.string().nullable(),
  replacement_id: z.string().nullable().optional(),
  created_at: z.string(),
});

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export const SettingsValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(SettingsValueSchema),
    z.record(SettingsValueSchema),
  ]),
);

export const SettingKeySchema = z.enum([
  "last_backup_at",
  "last_migration",
  "storage_persistence_requested",
]);

export const SettingSchema = z.object({
  key: SettingKeySchema,
  value: SettingsValueSchema,
});

export type CookProgress = z.infer<typeof CookProgressSchema>;
export type CookProgressPatch = z.infer<typeof CookProgressPatchSchema>;
export type RecipeDraft = z.infer<typeof RecipeDraftSchema>;
export type LocalImport = z.infer<typeof LocalImportSchema>;
export type SettingKey = z.infer<typeof SettingKeySchema>;
export type Setting = z.infer<typeof SettingSchema>;

export type LibrarySnapshot = {
  recipes: Recipe[];
  meal_plans: MealPlan[];
  shopping: ShoppingListItem[];
  pantry: PantryItem[];
  cook_progress: CookProgress[];
  drafts: RecipeDraft[];
  settings: Setting[];
};
